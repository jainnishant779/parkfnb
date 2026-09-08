// Local backend over the adb reverse tunnel:  adb reverse tcp:5000 tcp:5000
// (The Render deployment is not responding, and the owner onboarding
// endpoints only exist locally so far.)
export const API_BASE_URL = 'http://localhost:5000';
// export const API_BASE_URL = 'https://parkingbnbbackend.onrender.com';

export const API_TIMEOUT = 15000; // 15 seconds
