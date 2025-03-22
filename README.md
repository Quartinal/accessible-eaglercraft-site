## Accessible Eaglercraft Site

### Running

**Requirements** before running this project:

- Having run `pnpm i` in the root of the project
- Having run `pnpm psf` in the root of the project

**To make this project's build step work**, run these commands:

```shell
pnpm i -g tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react && pnpm link -g tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react
```

**To deploy this project**, run these commands:

***NOTICE***: DO NOT deploy to a Vercel hobby plan, it ultimately doesn't work.

- Vercel pro

```shell
vercel deploy --prod dist/
```

- CF Pages

**NOTICE**: CF Pages has a 25MiB upload limit set on each file regardless of how you're deploying it. To avoid a fatal error, change the `ZIP_FILE_URL` environment variable to the GitHub raw URL of the files.zip from this repository or a fork of your choice.

Follow the official Cloudflare instructions on how to connect a Git repository to deploy this.