interface ContainerProps {
    children: React.ReactNode;
}

export default function Container({ children }: ContainerProps) {
    return (
        <div className="min-h-screen flex flex-col">
            <main className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-20 2xl:px-24 flex-grow">
                {children}
            </main>
        </div>
    );
}