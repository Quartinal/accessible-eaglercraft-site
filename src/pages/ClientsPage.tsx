import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { configure, InMemory, umount, mount, resolveMountConfig } from '@zenfs/core';
import { exists, cp, mkdir, readFile, stat, readdir } from '@zenfs/core/promises';
import { IndexedDB } from '@zenfs/dom';
import { Zip } from '@zenfs/archives';

// Function to recursively find index.html in a directory
const findIndexHtml = async (basePath: string, currentPath: string = ''): Promise<string | null> => {
    const fullPath = `${basePath}${currentPath}`;

    try {
        const entries = await readdir(fullPath);

        // First check if index.html exists in current directory
        if (entries.includes('index.html')) {
            return `${currentPath}/index.html`.replace(/^\//, '');
        }

        // Then recursively check subdirectories
        for (const entry of entries) {
            const entryPath = `${fullPath}/${entry}`;
            const entryStat = await stat(entryPath);

            if (entryStat.isDirectory()) {
                const foundPath = await findIndexHtml(basePath, `${currentPath}/${entry}`);
                if (foundPath) return foundPath;
            }
        }
    } catch (error) {
        console.error(`Error searching directory ${fullPath}:`, error);
    }

    return null;
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

        // Check if we've already extracted this version and find index.html path
        const versionPath = `/eaglercraft-clients/${version}`;
        let indexHtmlPath: string | null = null;

        if (await exists(versionPath)) {
            indexHtmlPath = await findIndexHtml(versionPath);
        }

        // If index.html not found or version not extracted, extract from zip
        if (!indexHtmlPath) {
            console.log(`Extracting Minecraft client files...`);

            // Fetch the zip file
            const response = await fetch(document.body.getAttribute('data-zip-url'));
            if (!response.ok) throw new Error('Failed to fetch client files');
            const zipBuffer = await response.arrayBuffer();

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
                        const foundIndexPath = await findIndexHtml(`/tmp/files-zip/${entry}`);

                        if (foundIndexPath) {
                            availableVersions.push(entry);

                            // Extract this version to storage
                            console.log(`Extracting version ${entry}...`);
                            await mkdir(`/eaglercraft-clients/${entry}`, { recursive: true });
                            await cp(`/tmp/files-zip/${entry}`, `/eaglercraft-clients/${entry}`,
                                { recursive: true });

                            // If this is the version we're loading, save its index.html path
                            if (entry === version) {
                                indexHtmlPath = foundIndexPath;
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

        // Verify the client version exists with a valid index.html
        if (!indexHtmlPath) {
            throw new Error(`Version ${version} not found or no index.html in extracted files`);
        }

        const fullPath = `/eaglercraft-clients/${version}/${indexHtmlPath}`;
        const htmlContent = await readFile(fullPath);
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);

        return { indexPath: indexHtmlPath, blobUrl };
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
    const clientContainerRef = useRef<HTMLDivElement>(null);
    const [_, setIndexPath] = useState<string | null>(null);
    const [__, setBlobUrl] = useState<string | null>(null);

    // Validate supported versions
    const supportedVersions = ['1.12.2', '1.8.8', '1.7.3', '1.5.2'];

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
                setIndexPath(result.indexPath);
                setBlobUrl(result.blobUrl);

                // Create iframe to display the client
                if (clientContainerRef.current) {
                    const iframe = document.createElement('iframe');
                    iframe.style.width = '100%';
                    iframe.style.height = '100%';
                    iframe.style.border = 'none';
                    iframe.allowFullscreen = true;

                    // Set the source to the virtual filesystem path with the correct index.html path
                    iframe.src = result.blobUrl;

                    // Clear container and append iframe
                    clientContainerRef.current.innerHTML = '';
                    clientContainerRef.current.appendChild(iframe);
                }
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
                    {/* Client will be mounted here */}
                </div>
            </div>
        </div>
    );
}