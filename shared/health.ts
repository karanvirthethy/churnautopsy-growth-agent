export interface ConnectionCheck {
  status: "healthy" | "error" | "demo";
  message: string;
}
export interface ConnectionHealth {
  supabase: ConnectionCheck;
  hunter: ConnectionCheck;
}
