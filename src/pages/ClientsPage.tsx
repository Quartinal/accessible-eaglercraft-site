import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { configure, InMemory, mount, resolveMountConfig, umount } from '@zenfs/core';
import { cp, exists, mkdir, readdir, readFile, stat } from '@zenfs/core/promises';
import { IndexedDB } from '@zenfs/dom';
import { Zip } from '@zenfs/archives';
import supportedVersions from '@lib/clientVersions.ts';

// Function to find HTML files in a directory structure
const findHtmlFile = async (basePath: string, currentPath: string = ''): Promise<string | null> => {
    const fullPath = `${basePath}${currentPath}`;
    try {
        const entries = await readdir(fullPath);
        const htmlFiles: string[] = [];

        // First check if index.html exists in current directory
        if (entries.includes('index.html')) {
            return `${currentPath}/index.html`.replace(/^\//, '');
        }

        // Collect all HTML files in current directory
        for (const entry of entries) {
            if (entry.endsWith('.html')) {
                htmlFiles.push(`${currentPath}/${entry}`.replace(/^\//, ''));
            }
        }

        // If we found HTML files in this directory, return the first one
        if (htmlFiles.length > 0) {
            return htmlFiles[0];
        }

        // Recursively check subdirectories
        for (const entry of entries) {
            const entryPath = `${fullPath}/${entry}`;
            const entryStat = await stat(entryPath);

            if (entryStat.isDirectory()) {
                const foundPath = await findHtmlFile(basePath, `${currentPath}/${entry}`);
                if (foundPath) return foundPath;
            }
        }
    } catch (error) {
        console.error(`Error searching directory ${fullPath}:`, error);
    }

    return null;
};

// Function to create blob URLs for all assets and rewrite references
const processHtmlAndAssets = async (
    versionPath: string,
    htmlPath: string
): Promise<string> => {
    // Read the HTML content
    const htmlContent = await readFile(`${versionPath}/${htmlPath}`);
    const htmlText = new TextDecoder().decode(htmlContent);

    // Create a map to store blob URLs for assets
    const assetMap = new Map<string, string>();

    const processSpecialDirectory = async (
        versionPath: string,
        dirPath: string,
        assetMap: Map<string, string>
    ): Promise<Map<string, string>> => {
        try {
            const fullPath = `${versionPath}/${dirPath}`;
            const entries = await readdir(fullPath);

            for (const entry of entries) {
                const entryPath = `${dirPath}/${entry}`;
                const stats = await stat(`${versionPath}/${entryPath}`);

                if (stats.isFile()) {
                    // Create blob for each file in special directory
                    await createBlobForFile(entryPath, versionPath, assetMap);
                } else if (stats.isDirectory()) {
                    // Recursively process subdirectories
                    await processSpecialDirectory(versionPath, entryPath, assetMap);
                }
            }

            return assetMap;
        } catch (error) {
            console.warn(`Error processing directory ${dirPath}:`, error);
            return assetMap;
        }
    };

    // Helper function to create blob URL for a file
    // Function to create blob URLs for files
    const createBlobForFile = async (
        filePath: string,
        versionPath: string,
        assetMap: Map<string, string>
    ): Promise<string> => {
        // Return existing blob URL if already created
        if (assetMap.has(filePath)) {
            return assetMap.get(filePath)!;
        }

        try {
            const fullPath = `${versionPath}/${filePath}`;
            const fileContent = await readFile(fullPath);

            // Determine MIME type based on extension
            const extension = filePath.split('.').pop()?.toLowerCase() || '';
            let mimeType = 'application/octet-stream';

            switch (extension) {
                case 'html': mimeType = 'text/html'; break;
                case 'css': mimeType = 'text/css'; break;
                case 'js': mimeType = 'application/javascript'; break;
                case 'json': mimeType = 'application/json'; break;
                case 'png': mimeType = 'image/png'; break;
                case 'jpg':
                case 'jpeg': mimeType = 'image/jpeg'; break;
                case 'gif': mimeType = 'image/gif'; break;
                case 'svg': mimeType = 'image/svg+xml'; break;
                case 'mp3': mimeType = 'audio/mpeg'; break;
                case 'ogg': mimeType = 'audio/ogg'; break;
                case 'wav': mimeType = 'audio/wav'; break;
                case 'wasm': mimeType = 'application/wasm'; break;
                case 'ico': mimeType = 'image/x-icon'; break;
                case 'webp': mimeType = 'image/webp'; break;
                case 'ttf': mimeType = 'font/ttf'; break;
                case 'otf': mimeType = 'font/otf'; break;
                case 'woff': mimeType = 'font/woff'; break;
                case 'woff2': mimeType = 'font/woff2'; break;
                case 'map': mimeType = 'application/json'; break; // For .js.map files
                case 'txt': mimeType = 'text/plain'; break;
                case 'xml': mimeType = 'application/xml'; break;
                case 'pdf': mimeType = 'application/pdf'; break;
                case 'zip': mimeType = 'application/zip'; break;
                case 'webmanifest': mimeType = 'application/manifest+json'; break;
                case 'bin': mimeType = 'application/octet-stream'; break;
                case 'gltf': mimeType = 'model/gltf+json'; break;
                case 'glb': mimeType = 'model/gltf-binary'; break;
            }

            const blob = new Blob([fileContent], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            assetMap.set(filePath, blobUrl);
            console.log(`Created blob URL for ${filePath}:`, blobUrl);
            return blobUrl;
        } catch (error) {
            console.warn(`Could not create blob for ${filePath}:`, error);
            return filePath; // Return original path if file can't be read
        }
    };

    // Find all referenced files in HTML
    const cssRegex = /href=["']([^"']*\.css)["']/g;
    const jsRegex = /src=["']([^"']*\.js)["']/g;
    const imgRegex = /src=["']([^"']*\.(png|jpg|jpeg|gif|svg|ico))["']/g;
    const audioRegex = /src=["']([^"']*\.(mp3|ogg|wav))["']/g;
    const linkRegex = /href=["']([^"']*\.(png|jpg|jpeg|gif|svg|ico|json))["']/g;
    const wasmRegex = /src=["']([^"']*\.wasm)["']/g;
    const manifestRegex = /href=["']([^"']*\.webmanifest)["']/g;

    // Get the directory of the HTML file for relative path resolution
    const htmlDir = htmlPath.includes('/') ? htmlPath.substring(0, htmlPath.lastIndexOf('/')) : '';

    const specialDirs = ['lang', 'packs', 'assets'];
    for (const dir of specialDirs) {
        const dirPath = htmlDir ? `${htmlDir}/${dir}` : dir;
        try {
            if (await exists(`${versionPath}/${dirPath}`)) {
                console.log(`Pre-processing special directory: ${dirPath}`);
                await processSpecialDirectory(versionPath, dirPath, assetMap);
            }
        } catch (error) {
            console.warn(`Could not process ${dirPath} directory:`, error);
        }
    }

    // Function to resolve relative paths
    const resolvePath = (path: string): string => {
        if (path.startsWith('./')) {
            path = path.substring(2);
        }

        if (path.startsWith('/')) {
            return path.substring(1); // Remove leading slash
        }

        if (!path.startsWith('http:') && !path.startsWith('https:')) {
            return htmlDir ? `${htmlDir}/${path}` : path;
        }

        return path; // External URL, don't modify
    };

    // Process all asset types and replace URLs
    let modifiedHtml = htmlText;

    // Function to replace all regex matches with blob URLs
    const replaceAssetReferences = async (regex: RegExp, attributeGroup: number = 1): Promise<void> => {
        const matches = [...modifiedHtml.matchAll(regex)];
        for (const match of matches) {
            const originalPath = match[attributeGroup];
            if (originalPath.startsWith('http:') || originalPath.startsWith('https:')) {
                continue; // Skip external URLs
            }

            const resolvedPath = resolvePath(originalPath);
            try {
                const blobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
                modifiedHtml = modifiedHtml.replace(
                    new RegExp(`(["'])${originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'])`, 'g'),
                    `$1${blobUrl}$2`
                );
            } catch (error) {
                console.warn(`Failed to replace ${originalPath}:`, error);
            }
        }
    };

    // Process the most common asset types
    await replaceAssetReferences(cssRegex);
    await replaceAssetReferences(jsRegex);
    await replaceAssetReferences(imgRegex);
    await replaceAssetReferences(audioRegex);
    await replaceAssetReferences(linkRegex);
    await replaceAssetReferences(wasmRegex);
    await replaceAssetReferences(manifestRegex);

    // Process CSS files to replace URLs there too
    const cssMatches = [...htmlText.matchAll(cssRegex)];
    for (const match of cssMatches) {
        const cssPath = resolvePath(match[1]);
        try {
            const cssContent = await readFile(`${versionPath}/${cssPath}`);
            const cssText = new TextDecoder().decode(cssContent);

            // Find all url() references in CSS
            const cssUrlRegex = /url\(["']?([^"')]+)["']?\)/g;
            let modifiedCss = cssText;

            const cssDir = cssPath.includes('/') ? cssPath.substring(0, cssPath.lastIndexOf('/')) : '';

            const cssMatches = [...cssText.matchAll(cssUrlRegex)];
            for (const cssMatch of cssMatches) {
                const originalUrl = cssMatch[1];
                if (originalUrl.startsWith('http:') || originalUrl.startsWith('https:') || originalUrl.startsWith('data:')) {
                    continue; // Skip external or data URLs
                }

                // Resolve CSS asset path relative to the CSS file
                let resolvedCssPath = originalUrl;
                if (resolvedCssPath.startsWith('./')) {
                    resolvedCssPath = resolvedCssPath.substring(2);
                }
                if (!resolvedCssPath.startsWith('/')) {
                    resolvedCssPath = cssDir ? `${cssDir}/${resolvedCssPath}` : resolvedCssPath;
                } else {
                    resolvedCssPath = resolvedCssPath.substring(1);
                }

                try {
                    const blobUrl = await createBlobForFile(resolvedCssPath, versionPath, assetMap);
                    modifiedCss = modifiedCss.replace(
                        new RegExp(`url\\(["']?${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\)`, 'g'),
                        `url("${blobUrl}")`
                    );
                } catch (error) {
                    console.warn(`Failed to replace CSS URL ${originalUrl}:`, error);
                }
            }

            // Create a blob for the modified CSS
            const cssBlob = new Blob([modifiedCss], { type: 'text/css' });
            const cssBlobUrl = URL.createObjectURL(cssBlob);

            // Replace the CSS reference in HTML
            modifiedHtml = modifiedHtml.replace(
                new RegExp(`href=["']${match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
                `href="${cssBlobUrl}"`
            );
        } catch (error) {
            console.warn(`Failed to process CSS file ${cssPath}:`, error);
        }
    }

    // Function to process JavaScript files and handle WebAssembly calls
    const processJavaScriptFile = async (
        versionPath: string,
        jsPath: string,
        assetMap: Map<string, string>
    ): Promise<string> => {
        const jsContent = await readFile(`${versionPath}/${jsPath}`);
        let modifiedJs = new TextDecoder().decode(jsContent);

        // Get directory of JS file for resolving relative paths
        const jsDir = jsPath.includes('/') ? jsPath.substring(0, jsPath.lastIndexOf('/')) : '';

        // Function to resolve paths relative to JS file
        const resolvePath = (path: string): string => {
            if (path.startsWith('./')) path = path.substring(2);
            if (path.startsWith('/')) return path.substring(1);
            if (!path.startsWith('http:') && !path.startsWith('https:')) {
                return jsDir ? `${jsDir}/${path}` : path;
            }
            return path;
        };

        // Handle WebAssembly.instantiateStreaming
        const instantiateStreamingRegex = /WebAssembly\.instantiateStreaming\s*\(\s*fetch\s*\(\s*(['"`])([^'"`]+)(['"`])/g;
        const matches = [...modifiedJs.matchAll(instantiateStreamingRegex)];

        for (const match of matches) {
            const [fullMatch, quote, wasmPath, endQuote] = match;
            if (wasmPath.startsWith('http:') || wasmPath.startsWith('https:') || wasmPath.startsWith('blob:')) {
                continue; // Skip external or already processed URLs
            }

            const resolvedPath = resolvePath(wasmPath);
            try {
                // Create or get blob URL for wasm file
                const wasmBlobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);

                // Replace with custom implementation using blob URL
                const replacement = `WebAssembly.instantiate(await (await fetch(${quote}${wasmBlobUrl}${endQuote})).arrayBuffer()`;
                modifiedJs = modifiedJs.replace(fullMatch, replacement);
            } catch (error) {
                console.warn(`Failed to process WASM reference ${wasmPath}:`, error);
            }
        }

        // Handle WebAssembly.compile with fetch
        const compileRegex = /WebAssembly\.compile\s*\(\s*(?:await\s+)?fetch\s*\(\s*(['"`])([^'"`]+)(['"`])/g;
        const compileMatches = [...modifiedJs.matchAll(compileRegex)];

        for (const match of compileMatches) {
            const [_, quote, wasmPath, endQuote] = match;
            if (wasmPath.startsWith('http:') || wasmPath.startsWith('https:') || wasmPath.startsWith('blob:')) {
                continue;
            }

            const resolvedPath = resolvePath(wasmPath);
            try {
                const wasmBlobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
                modifiedJs = modifiedJs.replace(
                    `${quote}${wasmPath}${endQuote}`,
                    `${quote}${wasmBlobUrl}${endQuote}`
                );
            } catch (error) {
                console.warn(`Failed to process WASM compile reference ${wasmPath}:`, error);
            }
        }

        // Handle direct fetch of wasm files
        const fetchWasmRegex = /fetch\s*\(\s*(['"`])([^'"`]+\.wasm)(['"`])/g;
        const fetchMatches = [...modifiedJs.matchAll(fetchWasmRegex)];

        for (const match of fetchMatches) {
            const [_, quote, wasmPath, endQuote] = match;
            if (wasmPath.startsWith('http:') || wasmPath.startsWith('https:') || wasmPath.startsWith('blob:')) {
                continue;
            }

            const resolvedPath = resolvePath(wasmPath);
            try {
                const wasmBlobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
                modifiedJs = modifiedJs.replace(
                    `${quote}${wasmPath}${endQuote}`,
                    `${quote}${wasmBlobUrl}${endQuote}`
                );
            } catch (error) {
                console.warn(`Failed to process WASM fetch reference ${wasmPath}:`, error);
            }
        }

        return modifiedJs;
    };

    const jsMatches = [...htmlText.matchAll(jsRegex)];
    for (const match of jsMatches) {
        const jsPath = resolvePath(match[1]);
        try {
            // Process JavaScript file
            const modifiedJs = await processJavaScriptFile(versionPath, jsPath, assetMap);

            // Create blob for modified JavaScript
            const jsBlob = new Blob([modifiedJs], { type: 'application/javascript' });
            const jsBlobUrl = URL.createObjectURL(jsBlob);

            // Replace the JavaScript reference in HTML
            modifiedHtml = modifiedHtml.replace(
                new RegExp(`src=["']${match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
                `src="${jsBlobUrl}"`
            );
        } catch (error) {
            console.warn(`Failed to process JavaScript file ${jsPath}:`, error);
        }
    }

    const eaglerOptsRegex = /window\.eaglercraftXOpts\s*=\s*(\{[^}]*})/g;
    const matches = [...htmlText.matchAll(eaglerOptsRegex)];

    for (const match of matches) {
        const optionsText = match[1];
        // Parse paths in the options
        const assetUriMatch = optionsText.match(/assetsURI\s*:\s*['"]([^'"]+)['"]/);
        if (assetUriMatch) {
            const originalPath = assetUriMatch[1];
            if (!originalPath.startsWith('http:') && !originalPath.startsWith('https:')) {
                try {
                    const resolvedPath = resolvePath(originalPath);
                    // Check if this is an EPK/EPW file
                    if (resolvedPath.endsWith('.epk') || resolvedPath.endsWith('.epw')) {
                        const blobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
                        // Replace the path in the options
                        modifiedHtml = modifiedHtml.replace(
                            new RegExp(`assetsURI\\s*:\\s*['"]${originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
                            `assetsURI: "${blobUrl}"`
                        );
                    }
                } catch (error) {
                    console.warn(`Failed to process asset URI ${originalPath}:`, error);
                }
            }
        }

        const langUriMatch = optionsText.match(/langURI\s*:\s*['"]([^'"]+)['"]/);
        if (langUriMatch) {
            const originalPath = langUriMatch[1];
            if (!originalPath.startsWith('http:') && !originalPath.startsWith('https:')) {
                try {
                    // Handle language directory reference
                    if (originalPath.includes('lang/')) {
                        // No need to replace the langURI if it points to a directory
                        // We've already processed all files in special directories above
                    } else {
                        // It's a direct file reference
                        const resolvedPath = resolvePath(originalPath);
                        const blobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
                        modifiedHtml = modifiedHtml.replace(
                            new RegExp(`langURI\\s*:\\s*['"]${originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`),
                            `langURI: "${blobUrl}"`
                        );
                    }
                } catch (error) {
                    console.warn(`Failed to process lang URI ${originalPath}:`, error);
                }
            }
        }
    }

    // Create the final HTML blob
    return modifiedHtml;
};

const loadClient = async (version: string): Promise<{ indexPath: string, blobUrl: string }> => {
    try {
        // Configure filesystem with IndexedDB storage
        await configure({
            mounts: {
                '/eaglercraft-clients': IndexedDB,
                '/tmp': InMemory
            }
        });

        // Check if we've already extracted this version and find HTML file path
        const versionPath = `/eaglercraft-clients/${version}`;
        let htmlFilePath: string | null = null;

        if (await exists(versionPath)) {
            htmlFilePath = await findHtmlFile(versionPath);
        }

        // If HTML file not found or version not extracted, extract from zip
        if (!htmlFilePath) {
            console.log(`Extracting Minecraft client files...`);

            const zipUrl = document.body.getAttribute('data-zip-url')
                .replace(
                    /github\.com\/([^\/]+)\/([^\/]+)\/raw\/refs\/heads\/([^\/]+)\/(.*)/,
                    'media.githubusercontent.com/media/$1/$2/$3/$4',
                );
            console.log(`Using LFS media URL: ${zipUrl}`);
            const isGithubUrl = /https?:\/\/(?:www\.)?(?:github\.com|gist\.github\.com|api\.github\.com|raw\.githubusercontent\.com|user-images\.githubusercontent\.com)\/[\w\-./]+/i.test(zipUrl);
            isGithubUrl ? console.log('The zip URL is a GitHub URL') : console.warn('The zip URL is not a GitHub URL');

            // Fetch the zip file
            const response = await fetch(zipUrl, {
                mode: isGithubUrl ? 'no-cors' : 'cors',
            });
            if (!isGithubUrl && !response.ok) {
                throw new Error(`Failed to fetch the client files. The response was not ok: ${response.status} - ${response.statusText}`);
            }
            const zipBuffer = await response.arrayBuffer();
            if (zipBuffer.byteLength === 0) {
                throw new Error('Received empty response from the server');
            }

            // Mount the zip file in the filesystem
            const zipfs = await resolveMountConfig({ backend: Zip, data: zipBuffer });
            mount('/tmp/files-zip', zipfs);

            // Read root directory to find all available versions
            const rootEntries = await readdir('/tmp/files-zip');
            console.log(`Found ${rootEntries.length} entries in zip root:`, rootEntries);

            // Extract all version folders
            const availableVersions = [];

            for (const entry of rootEntries) {
                try {
                    const entryStats = await stat(`/tmp/files-zip/${entry}`);

                    if (entryStats.isDirectory()) {
                        // Find index.html recursively in this potential version directory
                        const foundIndexPath = await findHtmlFile(`/tmp/files-zip/${entry}`);

                        if (foundIndexPath) {
                            availableVersions.push(entry);

                            // Extract this version to storage
                            console.log(`Extracting version ${entry}...`);
                            await mkdir(`/eaglercraft-clients/${entry}`, { recursive: true });
                            await cp(`/tmp/files-zip/${entry}`, `/eaglercraft-clients/${entry}`,
                                { recursive: true });

                            // If this is the version we're loading, save its index.html path
                            if (entry === version) {
                                htmlFilePath = foundIndexPath;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing entry ${entry}:`, error);
                }
            }

            console.log(`Extracted ${availableVersions.length} versions: ${availableVersions.join(', ')}`);

            // Unmount the temporary zip
            umount('/tmp/files-zip');
        }

        // Verify the client version exists with a valid HTML file
        if (!htmlFilePath) {
            throw new Error(`Version ${version} not found or no HTML file in extracted files`);
        }

        // IMPORTANT: Process the HTML file to rewrite asset references with blob URLs
        const modifiedHtmlContent = await processHtmlAndAssets(versionPath, htmlFilePath);

        // Create blob URL from the modified HTML content
        const blob = new Blob([modifiedHtmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);

        console.log('Modified HTML content length:', modifiedHtmlContent.length);
        console.log('Created blob URL:', blobUrl);

        return { indexPath: htmlFilePath, blobUrl };
    } catch (error) {
        console.error('Error loading client:', error as Error);
        throw error as Error;
    }
};

export default function ClientPage() {
    const { version } = useParams<{ version: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [clientUrl, setClientUrl] = useState<string | null>(null);
    const clientContainerRef = useRef<HTMLDivElement>(null);
    //const [, setIndexPath] = useState<string | null>(null);
    //const [, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!version || !supportedVersions.includes(version)) {
            setError(`Minecraft version ${version} is not supported.`);
            setLoading(false);
            return;
        }

        // Load the client
        setLoading(true);
        loadClient(version)
            .then((result) => {
                setLoading(false);
                setClientUrl(result.blobUrl);
            })
            .catch(err => {
                console.error(err);
                setError(`Failed to load Minecraft ${version}: ${err.message}`);
                setLoading(false);
            });
    }, [version]);

    // Handle back button
    const handleBack = () => {
        navigate('/');
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-[70vh]">
                <div className="bg-ctp-surface0 p-8 rounded-xl max-w-xl text-center">
                    <h2 className="text-2xl font-bold text-ctp-red mb-4">Error</h2>
                    <p className="text-ctp-text mb-6">{error}</p>
                    <button
                        onClick={handleBack}
                        className="bg-ctp-blue px-6 py-2 rounded-lg c-white font-medium hover:bg-ctp-lavender transition"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-[70vh]">
                <div className="bg-ctp-surface0 p-8 rounded-xl max-w-xl text-center">
                    <h2 className="text-2xl font-bold text-ctp-blue mb-4">Loading Minecraft {version}</h2>
                    <div className="w-full bg-ctp-surface1 h-2 rounded-full overflow-hidden mb-4">
                        <div className="h-full bg-ctp-green w-3/4 animate-pulse"></div>
                    </div>
                    <p className="text-ctp-subtext">This may take a few moments...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[85vh]">
            <div className="flex justify-between items-center p-4 bg-ctp-crust">
                <button
                    onClick={handleBack}
                    className="bg-ctp-surface0 px-4 py-1 rounded text-ctp-text text-sm"
                >
                    ← Back
                </button>
                <div className="text-ctp-text font-semibold">Minecraft {version}</div>
                <div className="flex space-x-2">
                    <button className="bg-ctp-red px-3 py-1 rounded c-white text-sm">
                        Settings
                    </button>
                    <button className="bg-ctp-green px-3 py-1 rounded c-white text-sm">
                        Fullscreen
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-black relative">
                <div ref={clientContainerRef} className="absolute inset-0">
                    {clientUrl && (
                        <iframe
                            src={clientUrl}
                            style={{width: '100%', height: '100%', border: 'none'}}
                            allowFullScreen={true}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}