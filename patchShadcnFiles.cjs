const fs = require('fs');
const fg = require('fast-glob');

const filesToPatch = fg.sync('./src/components/ui/*.tsx');

const patchFile = (filePath, contextProvider, contextProviderProps) => {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading file ${filePath}:`, err);
      return;
    }

    const patchedData = data.replace(
      /return \(\s*<NavigationMenuPrimitive\.(\w+)([\s\S]*?)>\s*{([\s\S]*?)}\s*<\/NavigationMenuPrimitive\.\1>\s*\)/g,
      (_, component, props, children) => {
        return `return (
    <${contextProvider} ${contextProviderProps}>
      <NavigationMenuPrimitive.${component}${props}>
        {${children}}
      </NavigationMenuPrimitive.${component}>
    </${contextProvider}>
  )`;
      }
    );

    fs.writeFile(filePath, patchedData, 'utf8', (err) => {
      if (err) {
        console.error(`Error writing file ${filePath}:`, err);
      } else {
        console.log(`Successfully patched ${filePath}`);
      }
    });
  });
};

filesToPatch.forEach((filePath) => {
  if (filePath.includes('navigation-menu.tsx')) {
    patchFile(filePath, 'NavigationMenuPrimitive.Root', 'data-slot="navigation-menu"');
  } else if (filePath.includes('dropdown-menu.tsx')) {
    patchFile(filePath, 'DropdownMenuPrimitive.Root', 'data-slot="dropdown-menu"');
  }
});