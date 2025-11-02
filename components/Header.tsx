
import React from 'react';
import { SparklesIcon } from './Icons';

const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mt-4 flex h-16 items-center justify-between bg-black/20 backdrop-blur-lg border border-white/10 rounded-2xl px-6 shadow-lg">
          <div className="flex items-center">
            <SparklesIcon className="h-8 w-8 text-cyan-400" />
            <span className="ml-3 text-xl font-semibold text-gray-200">Humanizer AI</span>
          </div>
          <nav>
            <a
              href="https://ai.google.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              Powered by Gemini
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
