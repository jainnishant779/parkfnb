import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

// Navigation ref for navigating outside React components
export const navigationRef = createNavigationContainerRef();

export function navigate(name: string, params?: object) {
  if (navigationRef.isReady()) {
    (navigationRef as any).navigate(name, params);
  }
}

export function reset(name: string, params?: object) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name, params }],
      })
    );
  }
}
