import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { configure, InMemory, mount, resolveMountConfig, umount } from '@zenfs/core';
import { cp, exists, mkdir, readdir, readFile, stat } from '@zenfs/core/promises';
import { IndexedDB } from '@zenfs/dom';
import { Zip } from '@zenfs/archives';
import supportedVersions from '@lib/clientVersions.ts';
import 'animate.css';
import { parse, serialize } from 'cookie-es';

// Client usage tracking interface
interface ClientUsageData {
    version: string;
    count: number;
    lastUsed: number;
    htmlFiles?: string[];
}

// Cookie management functions
const COOKIE_NAME = 'eaglercraft_client_usage';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const getClientUsageData = (): ClientUsageData[] => {
    try {
        const cookies = parse(document.cookie);
        if (cookies[COOKIE_NAME]) {
            return JSON.parse(decodeURIComponent(cookies[COOKIE_NAME]));
        }
    } catch (error) {
        console.warn('Failed to parse client usage cookie:', error);
    }
    return [];
};

const saveClientUsageData = (usageData: ClientUsageData[]): void => {
    try {
        // Sort by most used and limit to 5 entries to keep cookie size reasonable
        const sortedData = [...usageData].sort((a, b) => b.count - a.count).slice(0, 5);
        document.cookie = serialize(
            COOKIE_NAME,
            encodeURIComponent(JSON.stringify(sortedData)),
            { maxAge: COOKIE_MAX_AGE, path: '/' }
        );
    } catch (error) {
        console.warn('Failed to save client usage cookie:', error);
    }
};

const updateClientUsage = (version: string, htmlFiles: string[]): void => {
    const usageData = getClientUsageData();
    const existingEntryIndex = usageData.findIndex(entry => entry.version === version);

    if (existingEntryIndex >= 0) {
        usageData[existingEntryIndex].count++;
        usageData[existingEntryIndex].lastUsed = Date.now();
        usageData[existingEntryIndex].htmlFiles = htmlFiles;
    } else {
        usageData.push({
            version,
            count: 1,
            lastUsed: Date.now(),
            htmlFiles
        });
    }

    saveClientUsageData(usageData);
};

// Find all HTML files in a directory structure
const findAllHtmlFiles = async (basePath: string, currentPath: string = ''): Promise<string[]> => {
    const fullPath = `${basePath}${currentPath}`;
    const htmlFiles: string[] = [];

    try {
        const entries = await readdir(fullPath);

        // First check if index.html exists in current directory
        if (entries.includes('index.html')) {
            htmlFiles.push(`${currentPath}/index.html`.replace(/^\//, ''));
        }

        // Collect all other HTML files
        for (const entry of entries) {
            if (entry.endsWith('.html') && entry !== 'index.html') {
                htmlFiles.push(`${currentPath}/${entry}`.replace(/^\//, ''));
            }
        }

        // Recursively check subdirectories
        for (const entry of entries) {
            const entryPath = `${fullPath}/${entry}`;
            const entryStat = await stat(entryPath);

            if (entryStat.isDirectory()) {
                const subDirFiles = await findAllHtmlFiles(basePath, `${currentPath}/${entry}`);
                htmlFiles.push(...subDirFiles);
            }
        }
    } catch (error) {
        console.error(`Error searching directory ${fullPath}:`, error);
    }

    return htmlFiles;
};

// Function to create blob URLs for files
const createBlobForFile = async (
    filePath: string,
    versionPath: string,
    assetMap: Map<string, string>
): Promise<string> => {
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
            case 'png': mimeType = 'image/png'; break;
            case 'jpg':
            case 'jpeg': mimeType = 'image/jpeg'; break;
            case 'gif': mimeType = 'image/gif'; break;
            case 'svg': mimeType = 'image/svg+xml'; break;
            case 'wasm': mimeType = 'application/wasm'; break;
            case 'lang': mimeType = 'text/plain'; break;
            // EPK and EPW are Eaglercraft-specific formats
            case 'epk': mimeType = 'application/octet-stream'; break;
            case 'epw': mimeType = 'application/octet-stream'; break;
        }

        const blob = new Blob([fileContent], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        assetMap.set(filePath, blobUrl);
        return blobUrl;
    } catch (error) {
        console.warn(`Could not create blob for ${filePath}:`, error);
        return filePath; // Return original path if file can't be read
    }
};

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

    // Handle EPK and EPW file references
    const epkEpwRegex = /(['"`])([^'"`]+\.(epk|epw))(['"`])/g;
    const epkEpwMatches = [...modifiedJs.matchAll(epkEpwRegex)];

    for (const match of epkEpwMatches) {
        const [_, quote, filePath, __, endQuote] = match;
        if (filePath.startsWith('http:') || filePath.startsWith('https:') || filePath.startsWith('blob:')) {
            continue;
        }

        const resolvedPath = resolvePath(filePath);
        try {
            const blobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
            modifiedJs = modifiedJs.replace(
                `${quote}${filePath}${endQuote}`,
                `${quote}${blobUrl}${endQuote}`
            );
        } catch (error) {
            console.warn(`Failed to process EPK/EPW file ${filePath}:`, error);
        }
    }

    return modifiedJs;
};

// Process HTML and assets
const processHtmlAndAssets = async (
    versionPath: string,
    htmlPath: string
): Promise<string> => {
    // Read the HTML content
    const htmlContent = await readFile(`${versionPath}/${htmlPath}`);
    const htmlText = new TextDecoder().decode(htmlContent);

    // Create a map to store blob URLs for assets
    const assetMap = new Map<string, string>();

    // Get the directory of the HTML file for relative path resolution
    const htmlDir = htmlPath.includes('/') ? htmlPath.substring(0, htmlPath.lastIndexOf('/')) : '';

    // Process lang directory if it exists
    try {
        const langDir = htmlDir ? `${htmlDir}/lang` : 'lang';
        if (await exists(`${versionPath}/${langDir}`)) {
            const langFiles = await readdir(`${versionPath}/${langDir}`);
            for (const file of langFiles) {
                if (file.endsWith('.lang')) {
                    await createBlobForFile(`${langDir}/${file}`, versionPath, assetMap);
                }
            }
        }
    } catch (error) {
        console.warn('Could not process lang directory:', error);
    }

    // Function to resolve relative paths
    const resolvePath = (path: string): string => {
        if (path.startsWith('./')) path = path.substring(2);
        if (path.startsWith('/')) return path.substring(1);
        if (!path.startsWith('http:') && !path.startsWith('https:')) {
            return htmlDir ? `${htmlDir}/${path}` : path;
        }
        return path;
    };

    // Asset regex patterns
    const cssRegex = /href=["']([^"']*\.css)["']/g;
    const jsRegex = /src=["']([^"']*\.js)["']/g;
    const imgRegex = /src=["']([^"']*\.(png|jpg|jpeg|gif|svg))["']/g;
    const wasmRegex = /src=["']([^"']*\.wasm)["']/g;
    const epkEpwRegex = /(?:src|data-[^=]+)=["']([^"']*\.(epk|epw))["']/g;

    let modifiedHtml = htmlText;

    // Function to replace asset references with blob URLs
    const replaceAssetReferences = async (regex: RegExp): Promise<void> => {
        const matches = [...modifiedHtml.matchAll(regex)];
        for (const match of matches) {
            const originalPath = match[1];
            if (originalPath.startsWith('http:') || originalPath.startsWith('https:') || originalPath.startsWith('blob:')) {
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

    // Process assets
    await replaceAssetReferences(cssRegex);
    await replaceAssetReferences(jsRegex);
    await replaceAssetReferences(imgRegex);
    await replaceAssetReferences(wasmRegex);
    await replaceAssetReferences(epkEpwRegex);

    // Process CSS files
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
                if (originalUrl.startsWith('http:') || originalUrl.startsWith('https:') || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
                    continue;
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

    // Process JavaScript files
    const jsMatches = [...htmlText.matchAll(jsRegex)];
    for (const match of jsMatches) {
        const jsPath = resolvePath(match[1]);
        try {
            const modifiedJs = await processJavaScriptFile(versionPath, jsPath, assetMap);

            const jsBlob = new Blob([modifiedJs], { type: 'application/javascript' });
            const jsBlobUrl = URL.createObjectURL(jsBlob);

            modifiedHtml = modifiedHtml.replace(
                new RegExp(`src=["']${match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'g'),
                `src="${jsBlobUrl}"`
            );
        } catch (error) {
            console.warn(`Failed to process JavaScript file ${jsPath}:`, error);
        }
    }

    // Handle eaglercraftXOpts for EPK/EPW files
    const eaglerOptsRegex = /window\.eaglercraftXOpts\s*=\s*(\{[^}]*})/g;
    const optMatches = [...htmlText.matchAll(eaglerOptsRegex)];

    for (const match of optMatches) {
        const optionsText = match[1];
        // Process assetsURI for EPK/EPW files
        const assetUriMatch = optionsText.match(/assetsURI\s*:\s*['"]([^'"]+)['"]/);
        if (assetUriMatch) {
            const originalPath = assetUriMatch[1];
            if (!originalPath.startsWith('http:') && !originalPath.startsWith('https:')) {
                try {
                    const resolvedPath = resolvePath(originalPath);
                    if (resolvedPath.endsWith('.epk') || resolvedPath.endsWith('.epw')) {
                        const blobUrl = await createBlobForFile(resolvedPath, versionPath, assetMap);
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
    }

    return modifiedHtml;
};

const loadClient = async (version: string): Promise<{ htmlFiles: string[], blobUrls: string[] }> => {
    try {
        // Check if we have a configured filesystem
        let needsConfiguration = true;
        try {
            // Test if filesystem is already configured
            await exists('/eaglercraft-clients');
            needsConfiguration = false;
        } catch (e) {
            needsConfiguration = true;
        }

        if (needsConfiguration) {
            // Configure filesystem with IndexedDB storage
            await configure({
                mounts: {
                    '/eaglercraft-clients': IndexedDB,
                    '/tmp': InMemory
                }
            });
        }

        // Check if we've already extracted this version and find HTML files
        const versionPath = `/eaglercraft-clients/${version}`;
        let htmlFiles: string[] = [];

        if (await exists(versionPath)) {
            htmlFiles = await findAllHtmlFiles(versionPath);
        }

        // If HTML files not found or version not extracted, extract from zip
        if (htmlFiles.length === 0) {
            console.log(`Extracting Minecraft client files...`);

            const zipUrl = document.body.getAttribute('data-zip-url')
                .replace(
                    /github\.com\/([^\/]+)\/([^\/]+)\/raw\/refs\/heads\/([^\/]+)\/(.*)/,
                    'media.githubusercontent.com/media/$1/$2/$3/$4',
                );

            // Fetch and process the zip file
            const response = await fetch(zipUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch client files: ${response.status}`);
            }

            const zipBuffer = await response.arrayBuffer();

            try {
                // First try to unmount if it exists (fix "mount point already exists" error)
                try {
                    umount('/tmp/files-zip');
                } catch (e) {
                    // Ignore errors if mount point doesn't exist
                }

                const zipfs = await resolveMountConfig({ backend: Zip, data: zipBuffer });
                mount('/tmp/files-zip', zipfs);

                // Extract files
                const rootEntries = await readdir('/tmp/files-zip');

                for (const entry of rootEntries) {
                    try {
                        const entryStats = await stat(`/tmp/files-zip/${entry}`);

                        if (entryStats.isDirectory()) {
                            // Find HTML files recursively
                            const foundHtmlFiles = await findAllHtmlFiles(`/tmp/files-zip/${entry}`);

                            if (foundHtmlFiles.length > 0) {
                                // Extract this version
                                await mkdir(`/eaglercraft-clients/${entry}`, { recursive: true });
                                await cp(`/tmp/files-zip/${entry}`, `/eaglercraft-clients/${entry}`, { recursive: true });

                                if (entry === version) {
                                    htmlFiles = foundHtmlFiles;
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing ${entry}:`, error);
                    }
                }

                // Unmount to clean up
                umount('/tmp/files-zip');
            } catch (error) {
                console.error('Error mounting zip file:', error);
                // Make sure to clean up
                try {
                    umount('/tmp/files-zip');
                } catch (e) {
                    // Ignore
                }
                throw error;
            }
        }

        if (htmlFiles.length === 0) {
            throw new Error(`No HTML files found for version ${version}`);
        }

        // Update usage tracking when we've successfully found HTML files
        updateClientUsage(version, htmlFiles);

        // Process all HTML files and create blob URLs
        const blobUrls = await Promise.all(
            htmlFiles.map(async (htmlPath) => {
                const modifiedHtml = await processHtmlAndAssets(versionPath, htmlPath);
                const blob = new Blob([modifiedHtml], { type: 'text/html' });
                return URL.createObjectURL(blob);
            })
        );

        return { htmlFiles, blobUrls };
    } catch (error) {
        console.error('Error loading client:', error);
        throw error;
    }
};

export default function ClientPage() {
    const { version } = useParams<{ version: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [, setHtmlFiles] = useState<string[]>([]);
    const [blobUrls, setBlobUrls] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fsConfigured = useRef<boolean>(false);

    useEffect(() => {
        if (!version || !supportedVersions.includes(version)) {
            setError(`Minecraft version ${version} is not supported.`);
            setLoading(false);
            return;
        }

        // Add Minecraft font
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = 'https://cdn.jsdelivr.net/npm/@south-paw/typeface-minecraft@1.0.0/index.min.css';
        document.head.appendChild(linkEl);

        // Add animate.css
        const animateCssLink = document.createElement('link');
        animateCssLink.rel = 'stylesheet';
        animateCssLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css';
        document.head.appendChild(animateCssLink);

        // Load the client
        loadClient(version)
            .then(({ htmlFiles, blobUrls }) => {
                setHtmlFiles(htmlFiles);
                setBlobUrls(blobUrls);
                setLoading(false);
                fsConfigured.current = true;
            })
            .catch(err => {
                console.error(err);
                setError(`Failed to load Minecraft ${version}: ${err.message}`);
                setLoading(false);
            });

        // Focus handler for key presses
        const handleKeyDown = (e: KeyboardEvent) => {
            const gameKeys = ['w', 'a', 's', 'd', ' '];
            if (gameKeys.includes(e.key.toLowerCase()) && iframeRef.current) {
                iframeRef.current.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        // Cleanup function when component unmounts
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.head.removeChild(linkEl);
            document.head.removeChild(animateCssLink);

            // Clean up filesystem mounts when leaving the page
            try {
                // Make sure to clean up /tmp/files-zip mount if it exists
                try {
                    umount('/tmp/files-zip');
                } catch (e) {
                    // Ignore if not mounted
                }
            } catch (e) {
                console.warn('Error unmounting filesystem:', e);
            }
        };
    }, [version]);

    // Focus the iframe when mounted or client changes
    useEffect(() => {
        if (iframeRef.current && !loading) {
            setTimeout(() => {
                iframeRef.current?.focus();
            }, 500);
        }
    }, [loading, currentIndex]);

    const navigateClient = (direction: number) => {
        if (isTransitioning) return;

        setIsTransitioning(true);
        const nextIndex = (currentIndex + direction + blobUrls.length) % blobUrls.length;

        setTimeout(() => {
            setCurrentIndex(nextIndex);
            setIsTransitioning(false);
        }, 800); // Increased duration to match animate.css animation duration
    };

    const openInNewTab = () => {
        if (!blobUrls[currentIndex]) return;

        const newWindow = window.open('about:blank', '_blank');
        if (!newWindow) return;

        newWindow.document.write(`
      <html lang="en">
        <head>
          <title>Minecraft ${version} - Client ${currentIndex + 1}</title>
          <style>
            body { margin: 0; padding: 0; overflow: hidden; }
            iframe { border: none; width: 100vw; height: 100vh; }
          </style>
        </head>
        <body>
          <iframe src="${blobUrls[currentIndex]}" allowfullscreen></iframe>
        </body>
      </html>
    `);
        newWindow.document.close();
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-8 h-[70vh]">
                <div className="bg-ctp-surface0 p-8 rounded-xl max-w-xl text-center minecraft-font animate__animated animate__fadeIn">
                    <h2 className="text-2xl font-bold text-ctp-red mb-4">Error</h2>
                    <p className="text-ctp-text mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="minecraft-button bg-ctp-blue px-6 py-2 rounded-none c-white font-medium hover:bg-ctp-lavender"
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
                <div className="bg-ctp-surface0 p-8 rounded-xl max-w-xl text-center minecraft-font animate__animated animate__fadeIn">
                    <h2 className="text-2xl font-bold text-ctp-blue mb-4">Loading Minecraft {version}</h2>
                    <div className="w-full bg-ctp-surface1 h-2 rounded-full overflow-hidden mb-4">
                        <div className="h-full bg-ctp-green w-3/4 animate__animated animate__pulse animate__infinite"></div>
                    </div>
                    <p className="text-ctp-subtext">This may take a few moments...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen max-h-[95vh]">
            {/* Control bar */}
            <div className="flex justify-between items-center p-2 bg-ctp-crust animate__animated animate__fadeInDown">
                <button
                    onClick={() => navigate('/')}
                    className="minecraft-button bg-ctp-surface0 px-4 py-1 rounded-none text-ctp-text text-sm"
                >
                    ← Back
                </button>

                <div className="flex items-center minecraft-font">
                    {blobUrls.length > 1 && (
                        <>
                            <button
                                onClick={() => navigateClient(-1)}
                                className={`minecraft-button bg-ctp-surface0 px-3 py-1 rounded-none mr-2 
                  ${isTransitioning ? 'opacity-50' : ''}`}
                                disabled={isTransitioning}
                            >
                                ◀
                            </button>
                            <span className="text-ctp-text px-2">
                Client {currentIndex + 1} of {blobUrls.length}
              </span>
                            <button
                                onClick={() => navigateClient(1)}
                                className={`minecraft-button bg-ctp-surface0 px-3 py-1 rounded-none ml-2 
                  ${isTransitioning ? 'opacity-50' : ''}`}
                                disabled={isTransitioning}
                            >
                                ▶
                            </button>
                        </>
                    )}
                    {blobUrls.length === 1 && (
                        <span className="text-ctp-text px-2 minecraft-font">
              Minecraft {version}
            </span>
                    )}
                </div>

                <div className="flex space-x-2">
                    <button
                        onClick={() => iframeRef.current?.focus()}
                        className="minecraft-button bg-ctp-blue px-3 py-1 rounded-none c-white text-sm"
                    >
                        Focus
                    </button>
                    <button
                        onClick={openInNewTab}
                        className="minecraft-button bg-ctp-mauve px-3 py-1 rounded-none c-white text-sm"
                    >
                        Open Tab
                    </button>
                </div>
            </div>

            {/* Game container */}
            <div ref={containerRef} className="flex-1 bg-black relative">
                <div className="absolute inset-0">
                    {blobUrls[currentIndex] && (
                        <iframe
                            ref={iframeRef}
                            src={blobUrls[currentIndex]}
                            style={{width: '100%', height: '100%', border: 'none'}}
                            title={`Minecraft ${version} - Client ${currentIndex + 1}`}
                            allowFullScreen={true}
                            onLoad={() => iframeRef.current?.focus()}
                            className={isTransitioning ? 'animate__animated animate__zoomOut' : 'animate__animated animate__zoomIn'}
                        />
                    )}
                </div>
            </div>

            {/* Styling */}
            {/*@ts-expect-error*/}
            <style jsx global>{`
                .minecraft-font {
                    font-family: 'Minecraft', sans-serif;
                    letter-spacing: 1px;
                }

                .minecraft-button {
                    box-shadow: 0 6px 0 #2d2d2d, 0 8px 10px rgba(0, 0, 0, 0.2);
                }

                .minecraft-button:hover {
                    animation: animate__pulse 0.5s;
                    box-shadow: 0 10px 0 #2d2d2d, 0 12px 16px rgba(0, 0, 0, 0.3);
                }

                .minecraft-button:active {
                    animation: animate__bounceIn 0.2s;
                    box-shadow: 0 2px 0 #2d2d2d, 0 3px 6px rgba(0, 0, 0, 0.1);
                }

                /* Ensure animate.css animations work properly */
                .animate__animated {
                    --animate-duration: 0.8s;
                }
            `}</style>
        </div>
    );
}