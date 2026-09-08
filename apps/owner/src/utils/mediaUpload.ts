import { PermissionsAndroid, Platform, Linking } from 'react-native';
import ImagePicker, { Image as CroppedImage } from 'react-native-image-crop-picker';
import { ownerService } from '../services/ownerService';
import type { UploadResponse } from '../types/api';
import { AppAlert } from '../components/common/AppAlert';

// react-native-image-crop-picker handles BOTH the picker and the crop UI
// in a single native flow: user picks (camera or gallery) → built-in
// cropper opens with the configured aspect → confirms → we receive the
// cropped image. This replaces the older "pick then upload raw" flow.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // Cloudinary free-tier image cap
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export type PickSource = 'camera' | 'gallery';

/**
 * Aspect ratios used across the app, matching how the image is later
 * displayed in the consumer app (or used internally for KYC). Keep this
 * map authoritative — call sites pass an `aspect` key, not raw numbers,
 * so we change one place if a display ratio changes.
 */
export type AspectRatio =
  /** Property / parking-space gallery image. Consumer app shows these in
   *  a 220px-tall, full-width main carousel — closest standard ratio is 16:9. */
  | 'property'
  /** Profile picture and selfie (KYC). Square. */
  | 'square'
  /** Government photo IDs (PAN, Aadhaar, driver's licence). CR80 standard. */
  | 'idCard'
  /** Free-aspect crop — for documents (utility bills, statements) where
   *  forcing a ratio would crop important content. User can still crop +
   *  rotate, but the aspect lock is off. */
  | 'free';

const ASPECT_DIMS: Record<Exclude<AspectRatio, 'free'>, { width: number; height: number }> = {
  property: { width: 1600, height: 900 },   // 16:9
  square:   { width: 1080, height: 1080 },  // 1:1
  idCard:   { width: 1600, height: 1009 },  // 1.586:1 (CR80)
};

export interface PickAndUploadOptions {
  source: PickSource;
  /** Aspect ratio of the cropper. Defaults to 'free'. */
  aspect?: AspectRatio;
  /** Override the default JPEG quality (0–1). */
  quality?: number;
}

export class MediaUploadError extends Error {
  code: 'CANCELLED' | 'INVALID_TYPE' | 'TOO_LARGE' | 'PICKER_ERROR' | 'UPLOAD_FAILED';
  constructor(code: MediaUploadError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function validate(image: CroppedImage): void {
  const mime = image.mime || '';
  if (mime && !ALLOWED_IMAGE_MIMES.includes(mime)) {
    throw new MediaUploadError(
      'INVALID_TYPE',
      'Only JPEG, PNG, or WEBP images are allowed.'
    );
  }
  if (image.size && image.size > MAX_IMAGE_BYTES) {
    throw new MediaUploadError(
      'TOO_LARGE',
      `Image is ${Math.round(image.size / (1024 * 1024))}MB. Maximum size is 10MB.`
    );
  }
  if (!image.path) {
    throw new MediaUploadError('PICKER_ERROR', 'Could not read the selected image.');
  }
}

async function pickAndCrop(options: PickAndUploadOptions): Promise<CroppedImage> {
  const aspect = options.aspect ?? 'free';
  const compress = Math.max(0, Math.min(1, options.quality ?? 0.85));

  const aspectDims =
    aspect === 'free'
      ? { width: 2048, height: 2048 } // upper bound for the cropper canvas
      : ASPECT_DIMS[aspect];

  const baseOptions = {
    cropping: true,
    width: aspectDims.width,
    height: aspectDims.height,
    // 'free' allows users to drag any rectangle; fixed aspects lock the box.
    freeStyleCropEnabled: aspect === 'free',
    mediaType: 'photo' as const,
    compressImageQuality: compress,
    includeBase64: false,
    cropperToolbarTitle: 'Crop image',
    cropperActiveWidgetColor: '#0D7377',
    cropperStatusBarColor: '#0D7377',
    cropperToolbarColor: '#FFFFFF',
    cropperToolbarWidgetColor: '#1F2937',
  };

  // Camera path on Android requires the runtime CAMERA permission.
  // react-native-image-crop-picker doesn't request it — without it,
  // openCamera throws E_NO_CAMERA_PERMISSION immediately. Request first;
  // if denied, throw a typed CANCELLED so callers stay quiet (we already
  // showed our own permission UI here).
  if (options.source === 'camera' && Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera permission',
        message: 'Allow camera access to take a photo of your document.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      },
    );
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      AppAlert.alert(
        'Camera access needed',
        'Enable camera permission for this app in Settings, or pick the image from your gallery instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
        ],
      );
      throw new MediaUploadError('CANCELLED', 'Camera permission denied');
    }
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      // User tapped "Cancel" on the OS prompt — silently bail.
      throw new MediaUploadError('CANCELLED', 'Camera permission denied');
    }
  }

  try {
    const result =
      options.source === 'camera'
        ? await ImagePicker.openCamera(baseOptions)
        : await ImagePicker.openPicker(baseOptions);
    return result as CroppedImage;
  } catch (err: any) {
    // The library throws a structured error with a message field. The
    // user-cancelled case is `E_PICKER_CANCELLED` on iOS / a string match on Android.
    const code = err?.code;
    const msg: string = err?.message || '';
    if (
      code === 'E_PICKER_CANCELLED' ||
      msg === 'User cancelled image selection' ||
      msg.toLowerCase().includes('cancel')
    ) {
      throw new MediaUploadError('CANCELLED', 'User cancelled');
    }
    // If the OS revoked permission between request and openCamera, the
    // library still throws E_NO_CAMERA_PERMISSION — surface it via our
    // own alert + Settings deep-link instead of the bare error.
    if (code === 'E_NO_CAMERA_PERMISSION' || msg.toLowerCase().includes('camera permission')) {
      AppAlert.alert(
        'Camera access needed',
        'Enable camera permission for this app in Settings, or pick the image from your gallery instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
        ],
      );
      throw new MediaUploadError('CANCELLED', 'Camera permission denied');
    }
    throw new MediaUploadError(
      'PICKER_ERROR',
      err?.message || 'Failed to open image picker.'
    );
  }
}

/**
 * Pick an image from camera/gallery, run it through the in-app cropper
 * with the configured aspect ratio, validate, and upload to the backend
 * (which forwards to Cloudinary). Returns the server response on success.
 *
 * Throws `MediaUploadError` — callers can inspect `.code` to differentiate
 * cancellation (ignore silently via `handleMediaUploadError`) from real
 * errors (alert shown).
 */
export async function pickAndUploadImage(
  options: PickAndUploadOptions
): Promise<UploadResponse> {
  const image = await pickAndCrop(options);
  validate(image);
  const mime = image.mime || 'image/jpeg';
  try {
    return await ownerService.uploadFile(image.path, mime);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[mediaUpload] upload failed:', {
      uri: image.path,
      mime,
      bytes: image.size,
      errName: err?.name,
      errCode: err?.code,
      errHttp: err?.http,
      errMessage: err?.message,
    });
    throw new MediaUploadError(
      'UPLOAD_FAILED',
      err?.message || 'Upload failed. Please try again.'
    );
  }
}

/** Show a user-friendly alert for a MediaUploadError (no-op for cancellations). */
export function handleMediaUploadError(err: unknown): void {
  if (err instanceof MediaUploadError) {
    if (err.code === 'CANCELLED') return;
    AppAlert.alert('Upload failed', err.message);
    return;
  }
  AppAlert.alert('Upload failed', 'Something went wrong. Please try again.');
}
