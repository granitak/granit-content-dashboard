# GRÁNIT content dashboard

Static HTML, CSS and JavaScript dashboard designed for GitHub Pages.

## No installation

The site runs directly in a browser. GitHub Pages hosts it.

## One-time configuration

Edit `config.js` and paste:

- the Supabase Project URL;
- the Supabase publishable/anon key.

Do not use the Supabase secret/service-role key here.

## Protection

The supplied database schema requires Supabase Auth login and Row Level Security before data can be read. Create approved dashboard users in Supabase Authentication.

## Publishing

Upload the files to a GitHub repository, then enable **Settings → Pages → Deploy from a branch → main / root**.
