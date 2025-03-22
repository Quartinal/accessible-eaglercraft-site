import '@unocss/reset/tailwind.css';
import 'uno.css';
import './styles/globals.css';

import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from "./components/ui/navigation-menu.tsx";
import Container from "./components/Container.tsx";
import ReactDOM from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage.tsx";
import ClientPage from "./pages/ClientsPage.tsx";
import getCatppuccinColor from '@lib/utils/getCatppuccinColor.ts';

export default function App() {
    gsap.registerPlugin(ScrollTrigger);

    // Define the transition style to reuse
    const smoothTransition = 'all 0.15s cubic-bezier(0.17, 0.67, 0.83, 0.67)';

    return (
        <BrowserRouter>
            <Container>
                <header className="py-4">
                    <NavigationMenu className="bg-ctp-base rounded-2xl w-full">
                        <NavigationMenuList style={{ transition: smoothTransition }}>
                            <NavigationMenuItem>
                                <NavigationMenuTrigger
                                    className="hover:bg-ctp-crust hover:rounded-[15px] hover:p-[12px]"
                                    style={{ transition: smoothTransition }}
                                >
                                    Clients
                                </NavigationMenuTrigger>
                                <NavigationMenuContent
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${getCatppuccinColor('frappe', 'base')} 55%, ${getCatppuccinColor('frappe', 'sky')} 45%)`,
                                        transition: smoothTransition,
                                        backdropFilter: 'blur(8px)'
                                    }}
                                    className="backdrop-blur-sm"
                                >
                                    <ul className="grid w-[400px] gap-3 p-4">
                                        {['1.12.2', '1.8.8', '1.7.3', '1.5.2'].map((version) => (
                                            <li key={version}>
                                                <NavigationMenuLink asChild>
                                                    <Link
                                                        to={`/clients/${version}/play`}
                                                        className="text-ctp-overlay2 hover:underline-ctp-overlay0"
                                                        style={{ transition: smoothTransition }}
                                                    >
                                                        {version}
                                                    </Link>
                                                </NavigationMenuLink>
                                            </li>
                                        ))}
                                    </ul>
                                </NavigationMenuContent>
                            </NavigationMenuItem>
                            <NavigationMenuItem>
                                <NavigationMenuLink asChild>
                                    <Link
                                        to="/"
                                        className="text-ctp-text hover:text-ctp-blue"
                                        style={{ transition: smoothTransition }}
                                    >
                                        Home
                                    </Link>
                                </NavigationMenuLink>
                            </NavigationMenuItem>
                        </NavigationMenuList>
                    </NavigationMenu>
                </header>

                <main className="flex-grow my-6">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/clients/:version/play" element={<ClientPage />} />
                    </Routes>
                </main>
            </Container>
        </BrowserRouter>
    );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);