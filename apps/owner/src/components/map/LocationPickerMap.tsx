import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Linking,
  ViewStyle,
} from 'react-native';
import { AppAlert } from '../common/AppAlert';
import Ionicons from 'react-native-vector-icons/Ionicons';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import Geolocation from 'react-native-geolocation-service';
import { palette, radii, fonts } from '../../theme/kit';

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

export interface LocationPickerMapProps {
  value: LatLng;
  onChange: (next: { lat: number; lng: number }) => void;
  /** Optional initial region — defaults to India centroid if value + seed are empty. */
  seedRegion?: { lat: number; lng: number };
  height?: number;
  containerStyle?: ViewStyle;
  /**
   * Hide the in-map "Use current location" button. Set this when the
   * surrounding screen already provides a location-permission trigger
   * (e.g., MergedOnboardingScreen's "Use my location to fill this") so
   * the user doesn't see two redundant buttons. Tap-to-pin and marker
   * drag remain available regardless.
   */
  hideCurrentLocationButton?: boolean;
}

const INDIA_CENTROID = { lat: 22.9734, lng: 78.6569 };

// Map picker built on a WebView + Leaflet (OpenStreetMap). This avoids
// react-native-maps' Android dependency on the Google Maps SDK + API key:
// Leaflet renders OSM tiles directly into the WebView, identical on iOS
// and Android, no key required. The user can tap the map to drop a pin
// or drag the existing marker; geolocation ("Use current location") still
// uses the native react-native-geolocation-service for accuracy.
const buildHtml = (initial: LatLng, seed?: { lat: number; lng: number }) => {
  const center = initial.lat != null && initial.lng != null
    ? { lat: initial.lat, lng: initial.lng }
    : seed ?? INDIA_CENTROID;
  const initialZoom = initial.lat != null && initial.lng != null ? 15 : 5;
  const hasInitial = initial.lat != null && initial.lng != null;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
  crossorigin=""></script>
<style>
  html,body,#map { margin:0; padding:0; height:100%; width:100%; background:#F3F4F6; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  function send(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }
  try {
    var map = L.map('map').setView([${center.lat}, ${center.lng}], ${initialZoom});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    var marker = null;
    function setMarker(lat, lng, recenter) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function(e) {
          var p = e.target.getLatLng();
          send({ type: 'move', lat: p.lat, lng: p.lng });
        });
      }
      if (recenter) map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
    window.setMarker = setMarker;

    if (${hasInitial}) setMarker(${center.lat}, ${center.lng}, false);

    map.on('click', function(e) {
      setMarker(e.latlng.lat, e.latlng.lng, false);
      send({ type: 'move', lat: e.latlng.lat, lng: e.latlng.lng });
    });

    send({ type: 'ready' });
  } catch (err) {
    send({ type: 'error', message: (err && err.message) || 'Map failed to load' });
  }
</script>
</body>
</html>`;
};

export default function LocationPickerMap({
  value,
  onChange,
  seedRegion,
  height = 240,
  containerStyle,
  hideCurrentLocationButton = false,
}: LocationPickerMapProps) {
  const webRef = useRef<WebView | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Build the HTML once per mount with the *initial* value baked in.
  // Subsequent value updates flow through injectJavaScript below.
  const html = useMemo(() => buildHtml(value, seedRegion), []); // eslint-disable-line react-hooks/exhaustive-deps

  // When the value changes from outside (e.g., "Use current location"),
  // push the new marker position into the WebView.
  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    if (value.lat == null || value.lng == null) return;
    webRef.current.injectJavaScript(
      `if (window.setMarker) window.setMarker(${value.lat}, ${value.lng}, true); true;`,
    );
  }, [value.lat, value.lng, mapReady]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(e.nativeEvent.data);
      if (payload.type === 'ready') {
        setMapReady(true);
      } else if (payload.type === 'move' && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
        onChange({ lat: payload.lat, lng: payload.lng });
      } else if (payload.type === 'error') {
        setMapError(payload.message || 'Map failed to load');
      }
    } catch {
      // Ignore malformed messages.
    }
  };

  // ---- Geolocation flow ----

  const requestLocationPermission = async (): Promise<'granted' | 'denied' | 'never_ask_again'> => {
    if (Platform.OS === 'ios') return 'granted';
    try {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location permission',
          message: 'Allow access so we can drop a pin at your current location.',
          buttonPositive: 'OK',
          buttonNegative: 'Cancel',
        },
      );
      if (status === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'never_ask_again';
      return 'denied';
    } catch {
      return 'denied';
    }
  };

  const showOpenSettingsAlert = () => {
    AppAlert.alert(
      'Location access needed',
      'Please enable location permission for this app in Settings to use the current location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch(() => {});
          },
        },
      ],
    );
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    const result = await requestLocationPermission();
    if (result === 'never_ask_again') {
      showOpenSettingsAlert();
      return;
    }
    if (result === 'denied') {
      AppAlert.alert('Permission denied', 'We need location access to set the pin automatically.');
      return;
    }
    setLocating(true);
    Geolocation.getCurrentPosition(
      (pos: { coords: { latitude: number; longitude: number } }) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err: { code?: number; message?: string }) => {
        setLocating(false);
        if (err.code === 1) {
          showOpenSettingsAlert();
          return;
        }
        if (err.code === 2) {
          AppAlert.alert(
            'Location services unavailable',
            'Turn on location services in your device settings, or drop the pin manually.',
          );
          return;
        }
        AppAlert.alert('Could not get location', err.message || 'Try again or drop the pin manually.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  return (
    <View style={containerStyle}>
      <View style={[styles.mapWrap, { height }]}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          style={StyleSheet.absoluteFillObject}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="compatibility"
          androidLayerType="hardware"
          startInLoadingState={false}
        />
        {!mapReady && !mapError ? (
          <View style={[StyleSheet.absoluteFillObject, styles.loadingOverlay]}>
            <ActivityIndicator size="small" color={palette.ink} />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        ) : null}
        {mapError ? (
          <View style={[StyleSheet.absoluteFillObject, styles.loadingOverlay]}>
            <Ionicons name="alert-circle-outline" size={28} color={palette.danger} />
            <Text style={styles.errorText}>{mapError}</Text>
            <Text style={styles.errorHintText}>Use the button below to drop a pin at your location.</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, hideCurrentLocationButton && styles.actionsRightAligned]}>
        {!hideCurrentLocationButton ? (
          <TouchableOpacity
            style={styles.useCurrentBtn}
            onPress={handleUseCurrentLocation}
            disabled={locating}
            activeOpacity={0.8}
          >
            {locating ? (
              <ActivityIndicator size="small" color={palette.textInverse} />
            ) : (
              <Ionicons name="locate" size={16} color={palette.textInverse} />
            )}
            <Text style={styles.useCurrentText}>
              {locating ? 'Locating…' : 'Use current location'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.coords}>
          {value.lat != null && value.lng != null
            ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : 'Tap the map or drag the pin'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.lg,
    backgroundColor: palette.fill,
  },
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.fill,
  },
  loadingText: { ...fonts.medium, marginTop: 6, color: palette.textMuted, fontSize: 12.5 },
  errorText: { ...fonts.semibold, marginTop: 6, color: palette.danger, fontSize: 13.5 },
  errorHintText: {
    ...fonts.medium,
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 12.5,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  actionsRightAligned: { justifyContent: 'flex-end' },
  useCurrentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
  },
  useCurrentText: {
    ...fonts.semibold,
    color: palette.textInverse,
    fontSize: 13,
    marginLeft: 6,
  },
  coords: {
    ...fonts.medium,
    fontSize: 12,
    color: palette.textMuted,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    marginLeft: 8,
    textAlign: 'right',
  },
});
