Save the Kapsule logo image here as:

    kapsule-logo.png

The app (src/components/Brand.tsx -> KapsuleMark) renders /kapsule-logo.png
with background-size: contain, so it displays intact — correct aspect ratio,
never stretched or distorted. Until this file exists, a vector fallback shows.

After adding the file, rebuild:  npm run build
