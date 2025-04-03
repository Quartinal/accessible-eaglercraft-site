import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import 'animate.css';
import clientVersions from '@lib/clientVersions.ts';

function isNumberString(str: string): boolean {
    return !isNaN(parseFloat(str)) && isFinite(Number(str));
}

function filterNumberStrings(arr: string[]): string[] {
    return arr.filter(isNumberString);
}

export default function HomePage() {
    const featuredVersions = filterNumberStrings(clientVersions);

    useEffect(() => {
        // Add Minecraft font from Google Fonts (closest web-safe option)
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = 'https://cdn.jsdelivr.net/npm/@south-paw/typeface-minecraft@1.0.0/index.min.css';
        document.head.appendChild(linkEl);

        // Add custom styling to body
        document.body.classList.add('minecraft-bg');

        return () => {
            document.body.classList.remove('minecraft-bg');
            document.head.removeChild(linkEl);
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center p-8 minecraft-pattern">
            {/* Custom CSS for Minecraft styling */}
            {/*@ts-expect-error*/}
            <style jsx global>{`
                .minecraft-font {
                    font-family: 'Minecraft', sans-serif;
                    letter-spacing: 1px;
                }

                .minecraft-bg {
                    background-color: #8BC34A;
                    background-image: linear-gradient(rgba(0, 0, 0, 0.2) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0, 0, 0, 0.2) 1px, transparent 1px);
                    background-size: 32px 32px;
                }

                .minecraft-button {
                    box-shadow: 0 6px 0 #2d2d2d, 0 8px 10px rgba(0, 0, 0, 0.2);
                }

                .minecraft-button:hover {
                    box-shadow: 0 10px 0 #2d2d2d, 0 12px 16px rgba(0, 0, 0, 0.3);
                }

                .minecraft-button:active {
                    box-shadow: 0 2px 0 #2d2d2d, 0 3px 6px rgba(0, 0, 0, 0.1);
                }

                .minecraft-card {
                    border: 4px solid #2d2d2d;
                    box-shadow: 0 8px 0 #2d2d2d, 0 10px 15px rgba(0, 0, 0, 0.2);
                }

                .minecraft-card:hover {
                    box-shadow: 0 13px 0 #2d2d2d, 0 15px 20px rgba(0, 0, 0, 0.3);
                }

                .pixelated {
                    image-rendering: pixelated;
                }

                /* Ensure animate.css animations work properly */
                .animate__animated {
                    --animate-duration: 0.8s;
                }
            `}</style>

            <h1 className="text-4xl font-bold mb-6 text-ctp-text minecraft-font tracking-wide text-center text-shadow animate__animated animate__fadeInDown">
                LAX1DUDE's Eaglercraft Collections
            </h1>

            <div className="max-w-2xl text-center mb-10 animate__animated animate__fadeIn">
                <p className="text-ctp-subtext mb-4 minecraft-font">
                    Experience Minecraft in your browser with Eaglercraft - a groundbreaking project by LAX1DUDE.
                    No downloads or plugins required, just pure JavaScript Minecraft.
                </p>
                <p className="text-ctp-subtext minecraft-font">
                    Choose from our collection of Eaglercraft versions below to start playing instantly.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
                {featuredVersions.map((version, index) => (
                    <Link
                        key={version}
                        to={`/clients/${version}/play`}
                        className="
                            minecraft-card
                            bg-ctp-surface0
                            p-6
                            rounded-none
                            flex
                            flex-col
                            items-center
                            justify-center
                            no-underline
                            animate__animated animate__zoomIn
                        "
                        style={{ animationDelay: `${index * 0.1}s` }}
                    >
                        <h2 className="text-2xl font-semibold text-ctp-mauve mb-2 minecraft-font">Minecraft {version}</h2>
                        <p className="text-ctp-subtext text-center minecraft-font">Experience Eaglercraft {version} directly in your browser.</p>
                        <div className="mt-4 bg-ctp-green minecraft-button px-6 py-3 rounded-none c-ctp-mantle font-medium minecraft-font animate__animated animate__pulse animate__infinite animate__slower">
                            LAUNCH CLIENT
                        </div>
                    </Link>
                ))}
            </div>

            <div className="mt-16 p-6 bg-ctp-surface0 rounded-none minecraft-card max-w-3xl animate__animated animate__fadeInUp">
                <h2 className="text-2xl font-semibold text-ctp-blue mb-4 minecraft-font">OFFICIAL UPDATES</h2>
                <ul className="space-y-3">
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2 minecraft-font">■</span>
                        <span className="text-ctp-text minecraft-font">New 1.12.2 client with Forge mod support and improved WebGL rendering</span>
                    </li>
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2 minecraft-font">■</span>
                        <span className="text-ctp-text minecraft-font">Enhanced 1.8.8 client with better multiplayer connectivity</span>
                    </li>
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2 minecraft-font">■</span>
                        <span className="text-ctp-text minecraft-font">Legacy clients (1.7.3 and 1.5.2) now feature improved browser compatibility</span>
                    </li>
                </ul>
            </div>

            <div className="mt-8 text-center text-ctp-subtext text-sm minecraft-font animate__animated animate__fadeIn animate__delay-1s">
                <p></p>
                <p className="mt-2">This site is a collection of Eaglercraft clients and is not affiliated with Mojang or Microsoft</p>
            </div>
        </div>
    );
}