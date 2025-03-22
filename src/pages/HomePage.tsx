import { Link } from 'react-router-dom';

export default function HomePage() {
    const featuredVersions = ['1.12.2', '1.8.8', '1.7.3', '1.5.2'];

    return (
        <div className="flex flex-col items-center justify-center p-8">
            <h1 className="text-3xl font-bold mb-6 text-ctp-text">LAX1DUDE's Eaglercraft Collections</h1>

            <div className="max-w-2xl text-center mb-10">
                <p className="text-ctp-subtext mb-4">
                    Experience Minecraft in your browser with Eaglercraft - a groundbreaking project by LAX1DUDE.
                    No downloads or plugins required, just pure JavaScript Minecraft.
                </p>
                <p className="text-ctp-subtext">
                    Choose from our collection of Eaglercraft versions below to start playing instantly.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {featuredVersions.map((version) => (
                    <Link
                        key={version}
                        to={`/clients/${version}/play`}
                        className="
                            bg-ctp-surface0
                            hover:bg-ctp-surface1
                            p-6
                            rounded-xl
                            shadow-md
                            transition-all
                            duration-200
                            flex
                            flex-col
                            items-center
                            justify-center
                        "
                    >
                        <h2 className="text-xl font-semibold text-ctp-mauve mb-2">Eaglercraft {version}</h2>
                        <p className="text-ctp-subtext text-center">Experience Minecraft {version} directly in your browser.</p>
                        <div className="mt-4 bg-ctp-green px-4 py-2 rounded-lg c-white font-medium">
                            Launch Client
                        </div>
                    </Link>
                ))}
            </div>

            <div className="mt-16 p-6 bg-ctp-surface0 rounded-xl max-w-3xl">
                <h2 className="text-2xl font-semibold text-ctp-blue mb-4">Official Updates</h2>
                <ul className="space-y-3">
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2">•</span>
                        <span className="text-ctp-text">New 1.12.2 client with Forge mod support and improved WebGL rendering</span>
                    </li>
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2">•</span>
                        <span className="text-ctp-text">Enhanced 1.8.8 client with better multiplayer connectivity</span>
                    </li>
                    <li className="flex items-start">
                        <span className="text-ctp-red mr-2">•</span>
                        <span className="text-ctp-text">Legacy clients (1.7.3 and 1.5.2) now feature improved browser compatibility</span>
                    </li>
                </ul>
            </div>

            <div className="mt-8 text-center text-ctp-subtext text-sm">
                <p>Eaglercraft by LAX1DUDE - A project that brings Minecraft Java Edition to browsers using WebGL and JavaScript</p>
                <p className="mt-2">This site is a collection of Eaglercraft clients and does not claim ownership of the original work</p>
            </div>
        </div>
    );
}