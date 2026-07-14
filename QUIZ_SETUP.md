# Activar el quiz en vivo

1. Crea un proyecto de Supabase, habilita **Anonymous Sign-Ins** y configura CAPTCHA para ese proveedor.
2. Copia `.env.example` como `.env.local` e ingresa la URL y publishable key del proyecto. No uses una clave `service_role` en el sitio.
3. Instala y autentica el CLI de Supabase; luego aplica la base de datos:

   ```powershell
   supabase db push
   node scripts/generate-quiz-seed.mjs > supabase/seed.sql
   ```

   Ejecuta el contenido generado de `supabase/seed.sql` en el SQL Editor de Supabase. Luego publica el sitio en HTTPS. El QR utiliza la dirección actual y genera rutas `#/quiz/CODIGO`, compatibles con hosting estático.

El primer comando crea tablas, RPCs, RLS y el canal privado de Realtime. El segundo genera las 24 preguntas desde el CSV actual; ejecútalo cada vez que se reemplace el dataset. `npm run quiz:validate` comprueba el banco sin modificar la base.

Mientras falten las variables de entorno, la última sala funciona como demo local en el navegador, pero no puede conectar otros teléfonos.
