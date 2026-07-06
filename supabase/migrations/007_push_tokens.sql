-- Almacena el token de Expo Push Notifications por usuario.
-- Null = usuario no dio permiso o usa un cliente sin soporte de notificaciones.
alter table usuarios add column if not exists push_token text;
