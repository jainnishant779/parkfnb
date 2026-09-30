/**
 * Profile completion % shared by ProfilePage (plan card) and EditProfilePage
 * (progress hint). Six equal parts: name, email, phone, photo, a vehicle and a
 * payment method.
 */
export const calculateProfileCompletion = ({ user, fullName, vehicleCount = 0, paymentCount = 0 }) => {
  let completed = 0;
  if (fullName) completed++;
  if (user?.email) completed++;
  if (user?.phone) completed++;
  if (user?.profileImage || user?.profilePictureUrl) completed++;
  if (vehicleCount > 0) completed++;
  if (paymentCount > 0) completed++;
  return Math.round((completed / 6) * 100);
};
