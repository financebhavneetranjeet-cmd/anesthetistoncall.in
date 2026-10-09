declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    GOOGLE_OAUTH_CLIENT_ID?: string;
    GOOGLE_OAUTH_CLIENT_SECRET?: string;
    GOOGLE_OAUTH_REDIRECT_URI?: string;
    BUCKET?: R2Bucket;
    MSG91_AUTH_KEY?: string;
    MSG91_WIDGET_ID?: string;
    MSG91_WIDGET_TOKEN?: string;
    MSG91_TEMPLATE_ID?: string;
    MSG91_FLOW_ID?: string;
    MSG91_WHATSAPP_TEMPLATE_ID?: string;
    GOOGLE_MAPS_API_KEY?: string;
    GOOGLE_PLACES_SERVER_API_KEY?: string;
    ADMIN_EMAILS?: string;
    ADMIN_MOBILES?: string;
    MSG91_HOSPITAL_APPROVAL_TEMPLATE_ID?: string;
    MSG91_HOSPITAL_APPROVAL_VARIABLES?: string;
    MSG91_CASE_POSTED_TEMPLATE_ID?: string;
    MSG91_CASE_POSTED_VARIABLES?: string;
    WEB_PUSH_PUBLIC_KEY?: string;
    WEB_PUSH_PRIVATE_KEY?: string;
  }
}
