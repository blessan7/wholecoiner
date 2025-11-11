import { Inter } from "next/font/google";
import "./globals.css";
import PrivyProviderWrapper from "@/lib/privy-provider";
import MaterialSymbolsLoader from "@/components/MaterialSymbolsLoader";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Wholecoiner - Clarity for your Crypto Portfolio",
  description: "Systematically accumulate 1 full BTC, ETH, or SOL through disciplined micro-investments",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-display bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark`}
      >
        <MaterialSymbolsLoader />
        <PrivyProviderWrapper>
          {children}
        </PrivyProviderWrapper>
      </body>
    </html>
  );
}
