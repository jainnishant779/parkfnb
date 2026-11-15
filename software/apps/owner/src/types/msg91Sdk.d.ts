/**
 * Type shim for `@msg91comm/sendotp-react-native`.
 *
 * The SDK ships TypeScript source (not just `.d.ts`) with implicit-any
 * violations that fail under our `strict: true` tsconfig. `skipLibCheck`
 * only skips declaration files, not source. Redirecting the module to
 * this declaration via `paths` makes the compiler treat the SDK as a
 * pre-typed black box. Runtime is unaffected — Metro/Babel still loads
 * the real `index.ts` from `node_modules`.
 */
declare module '@msg91comm/sendotp-react-native' {
  export type Msg91WidgetResponse = {
    type?: 'success' | 'error';
    message?: string;
    [key: string]: any;
  };

  export const OTPWidget: {
    initializeWidget(widgetId: string, tokenAuth: string): Promise<void>;
    sendOTP(body: { identifier: string; [key: string]: any }): Promise<Msg91WidgetResponse>;
    verifyOTP(body: { reqId: string | null; otp: string; [key: string]: any }): Promise<Msg91WidgetResponse>;
    retryOTP(body: { reqId: string | null; retryChannel?: number; [key: string]: any }): Promise<Msg91WidgetResponse>;
    getWidgetProcess(): Promise<Msg91WidgetResponse>;
  };

  export const DefaultWidget: any;
}
