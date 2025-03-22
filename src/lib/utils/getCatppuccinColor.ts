import { flavors } from '@catppuccin/palette';

type CatppuccinColor =
    | 'rosewater' | 'flamingo' | 'pink' | 'mauve' | 'red' | 'maroon'
    | 'peach' | 'yellow' | 'green' | 'teal' | 'sky' | 'sapphire'
    | 'blue' | 'lavender' | 'text' | 'subtext1' | 'subtext0'
    | 'overlay2' | 'overlay1' | 'overlay0' | 'surface2' | 'surface1'
    | 'surface0' | 'base' | 'mantle' | 'crust';

type CatppuccinFlavor = 'latte' | 'frappe' | 'macchiato' | 'mocha';

/**
 * Gets a color from a Catppuccin palette
 * @param flavor The flavor of the palette
 * @param color The color to get from the palette
 * @returns The hex code of the color, or mantle if not found
 */
export default function getCatppuccinColor(flavor: CatppuccinFlavor, color: CatppuccinColor): string {
    const palette = flavors[flavor];

    if (palette.colors[color]) {
        return palette.colors[color].hex;
    }

    return palette.colors.mantle.hex;
}

//console.log(getCatppuccinColor('frappe', 'base'));