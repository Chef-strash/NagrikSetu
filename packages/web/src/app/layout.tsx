import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppProvider } from "../lib/context/AppContext";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Sidebar } from "../components/Sidebar";

export const metadata: Metadata = {
  title: "NagrikSetu | Pune Municipal Schemes Guide",
  description: "Independent municipal scheme discovery, document verification, and preparation toolkit for Pune citizens.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-screen flex flex-col bg-black text-white font-sans antialiased overflow-hidden">
        <AppProvider>
          <div className="flex h-full w-full">
            <Suspense
              fallback={
                <aside className="w-64 bg-[#050505] border-r border-[#222] flex-col hidden md:flex shrink-0" />
              }
            >
              <Sidebar />
            </Suspense>
            <div className="flex-1 flex flex-col min-w-0">
              <Header />
              <div id="main-scroll-area" className="flex-1 overflow-y-auto relative flex flex-col">
                <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6 flex flex-col">
                  {children}
                </main>
                <Footer />
              </div>
            </div>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
