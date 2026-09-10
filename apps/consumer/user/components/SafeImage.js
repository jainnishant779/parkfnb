import React, { useState } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { resolveImageUri } from '../utils/imageUri';

export default function SafeImage({
  uri,
  style,
  resizeMode = 'cover',
  placeholderIcon = 'parking',
  placeholderSize = 28,
  placeholderColor = '#1A73E8',
  placeholderStyle,
  children,
  ...props
}) {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveImageUri(uri);

  if (!resolved || hasError) {
    return (
      <View style={[styles.placeholder, style, placeholderStyle]}>
        <MaterialIcon name={placeholderIcon} size={placeholderSize} color={placeholderColor} />
        {children}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolved }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setHasError(true)}
      {...props}
    >
      {children}
    </Image>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
