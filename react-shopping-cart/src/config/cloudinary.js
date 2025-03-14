import { Cloudinary } from '@cloudinary/url-gen';
import CryptoJS from 'crypto-js';

// Get Cloudinary configuration from environment variables
const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;

export const generateSignature = (params) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = Object.entries({ timestamp, ...params })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&') + apiSecret;

  return CryptoJS.SHA1(toSign).toString();
};

// Create a Cloudinary instance and set your cloud name
const cld = new Cloudinary({
  cloud: {
    cloudName
  },
  url: {
    secure: true // force https
  }
});

export const cloudinaryConfig = {
  cloudName,
  apiKey,
  generateSignature
};

export const getImageUrl = (publicId, options = {}) => {
  if (!publicId) return ''; // Return empty string if no publicId is provided

  const {
    width = 800,
    height = 600,
    quality = 'auto',
    format = 'auto'
  } = options;

  return cld
    .image(publicId)
    .format(format)
    .quality(quality)
    .resize(`w_${width},h_${height},c_fill`)
    .toURL();
};

// Function to generate thumbnail URLs
export const getThumbnailUrl = (publicId) => {
  if (!publicId) return '';
  return getImageUrl(publicId, {
    width: 300,
    height: 300
  });
};

// Function to generate full-size image URLs
export const getFullSizeUrl = (publicId) => {
  if (!publicId) return '';
  return getImageUrl(publicId, {
    width: 1200,
    height: 1200
  });
};

// Function to generate optimized product card images
export const getProductCardUrl = (publicId) => {
  if (!publicId) return '';
  return getImageUrl(publicId, {
    width: 600,
    height: 800,
    quality: 'auto:good'
  });
}; 