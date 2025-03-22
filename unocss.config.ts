import { defineConfig, presetWind3 } from 'unocss';
import presetShadcn from 'unocss-preset-shadcn';
import { presetCatppuccin } from 'unocss-catppuccin';
import { presetAnimations } from 'unocss-preset-animations';
import type { Preset } from 'unocss';
import type { Theme } from 'unocss/preset-mini';

export default defineConfig({
  presets: [
    presetShadcn({}, {
      componentLibrary: 'radix',
    }),
    presetCatppuccin({
      prefix: 'ctp',
      defaultFlavour: 'frappe',
    }) as unknown as Preset<Theme>,
    presetWind3(),
    presetAnimations(),
  ],
});