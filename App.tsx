import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import Header from './components/Header';
import Loader from './components/Loader';
import { humanizeText } from './services/geminiService';
import { Tone, Voice, RewriteOptions, OutputFormat, ConversionChange, HumanizationStats } from './types';
import { parseDocxFile, parsePdfFile, downloadDocxFile, downloadPdfFile } from './utils/fileUtils';
import { UploadIcon, ClipboardIcon, DownloadIcon, TrashIcon, LightbulbIcon, ChartBarIcon, EyeIcon, ArrowsPointingOutIcon } from './components/Icons';

const Tooltip: React.FC<{ change: ConversionChange; isVisible: boolean }> = ({ change, isVisible }) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});

    useLayoutEffect(() => {
        if (!isVisible || !tooltipRef.current) return;

        const tooltipEl = tooltipRef.current;
        const anchorEl = tooltipEl.parentElement;
        const containerEl = anchorEl?.closest('.overflow-y-auto');

        if (!anchorEl || !containerEl) return;

        // 1. Get all rects in viewport coordinates
        const anchorRect = anchorEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const MARGIN = 12;

        // Bail out if tooltip has no dimensions yet
        if (tooltipRect.width === 0 || tooltipRect.height === 0) return;

        // 2. Decide on vertical placement (prefer below)
        const spaceBelow = containerRect.bottom - anchorRect.bottom;
        const spaceAbove = anchorRect.top - containerRect.top;
        const placeAbove = (spaceBelow < tooltipRect.height + MARGIN) && (spaceAbove > tooltipRect.height + MARGIN);

        // 3. Calculate ideal tooltip position in viewport coordinates
        let top, left;

        if (placeAbove) {
            top = anchorRect.top - tooltipRect.height - MARGIN;
        } else {
            top = anchorRect.bottom + MARGIN;
        }
        left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);

        // 4. Clamp position to container's rect to prevent overflow
        top = Math.max(containerRect.top, top);
        top = Math.min(containerRect.bottom - tooltipRect.height, top);

        left = Math.max(containerRect.left, left);
        left = Math.min(containerRect.right - tooltipRect.width, left);

        // 5. Convert clamped viewport coordinates to style properties relative to the anchor
        const finalTop = top - anchorRect.top;
        const finalLeft = left - anchorRect.left;

        const newTooltipStyle: React.CSSProperties = {
            opacity: 1,
            visibility: 'visible',
            transform: 'translateY(0)',
            top: `${finalTop}px`,
            left: `${finalLeft}px`,
        };
        
        // --- ARROW POSITIONING ---
        const newArrowStyle: React.CSSProperties = {};
        if (placeAbove) {
            newArrowStyle.top = '100%'; // Arrow at bottom of tooltip, pointing down
            newArrowStyle.borderTopColor = 'rgb(31 41 55)';
        } else {
            newArrowStyle.bottom = '100%'; // Arrow at top of tooltip, pointing up
            newArrowStyle.transform = 'rotate(180deg)';
            newArrowStyle.borderTopColor = 'rgb(31 41 55)';
        }
        
        // Arrow Horizontal Position:
        const anchorCenterX_viewport = anchorRect.left + anchorRect.width / 2;
        // arrowLeft is relative to the tooltip's left edge
        let arrowLeft = anchorCenterX_viewport - left - 10; // 10 is half arrow width
        // Clamp it to stay within the tooltip's padding
        arrowLeft = Math.max(8, arrowLeft);
        arrowLeft = Math.min(tooltipRect.width - 28, arrowLeft);
        newArrowStyle.left = `${arrowLeft}px`;

        setStyle(newTooltipStyle);
        setArrowStyle(newArrowStyle);

    }, [isVisible, change]);

    const initialStyle: React.CSSProperties = {
        opacity: 0,
        visibility: 'hidden',
        transform: 'translateY(-4px)',
    };

    return (
        <div
            ref={tooltipRef}
            className={`absolute w-80 p-3 text-sm leading-normal text-white bg-gray-800 border border-gray-600 rounded-lg shadow-lg shadow-cyan-500/10 pointer-events-none transform transition-all duration-300 ease-in-out z-10`}
            style={isVisible ? style : initialStyle}
            role="tooltip"
        >
            <div className="space-y-3">
                <div>
                    <span className="text-xs font-semibold uppercase text-red-400">Before</span>
                    <div className="bg-red-900/30 border border-red-800/50 rounded-md p-2 mt-1">
                        <p className="text-gray-400 italic line-through">"{change.originalText}"</p>
                    </div>
                </div>
                <div>
                    <span className="text-xs font-semibold uppercase text-cyan-400">After</span>
                     <div className="bg-cyan-900/30 border border-cyan-800/50 rounded-md p-2 mt-1">
                        <p className="text-gray-200">"{change.humanizedText}"</p>
                    </div>
                </div>
                <div>
                    <span className="text-xs font-semibold uppercase text-yellow-400">Reason</span>
                    <p className="text-gray-300 text-sm mt-1">{change.explanation}</p>
                </div>
            </div>
            {/* Arrow */}
            <div
                className={`absolute w-0 h-0 border-x-[10px] border-x-transparent border-t-[10px]`}
                style={arrowStyle}
            ></div>
        </div>
    );
};


const App: React.FC = () => {
    const [inputText, setInputText] = useState<string>('');
    const [outputText, setOutputText] = useState<string>('');
    const [changes, setChanges] = useState<ConversionChange[]>([]);
    const [stats, setStats] = useState<HumanizationStats | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [options, setOptions] = useState<RewriteOptions>({
        tone: 'professional',
        voice: 'first-person',
        expand: false,
    });
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('docx');
    const [fileName, setFileName] = useState<string>('humanized-text');
    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [showAnalysis, setShowAnalysis] = useState<boolean>(true);
    const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState<boolean>(false);
    const [textAreasHeight, setTextAreasHeight] = useState<number>(320);
    const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        resizeStartRef.current = { y: e.clientY, height: textAreasHeight };
        setIsResizing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeStartRef.current) return;
            const deltaY = e.clientY - resizeStartRef.current.y;
            const newHeight = resizeStartRef.current.height + deltaY;
            setTextAreasHeight(Math.max(200, newHeight)); // Set a min height of 200px
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            resizeStartRef.current = null;
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    const clearOutput = () => {
        setOutputText('');
        setChanges([]);
        setStats(null);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setError(null);
        setIsLoading(true);
        clearOutput();
        setFileName(file.name.replace(/\.[^/.]+$/, ""));

        try {
            let text = '';
            if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
                text = await parseDocxFile(file);
            } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                text = await parsePdfFile(file);
            } else if (file.type === 'text/plain') {
                text = await file.text();
            } else {
                throw new Error('Unsupported file type. Please upload a .docx, .pdf, or .txt file.');
            }
            setInputText(text);
        } catch (err: any) {
            setError(err.message || 'Failed to process file.');
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRewrite = async () => {
        if (!inputText.trim()) {
            setError('Please enter some text or upload a file to rewrite.');
            return;
        }
        setError(null);
        setIsLoading(true);
        clearOutput();
        setShowAnalysis(true);

        try {
            const result = await humanizeText(inputText, options);
            setOutputText(result.text);
            setChanges(result.changes);
            setStats(result.stats);
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!outputText) return;
        navigator.clipboard.writeText(outputText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownload = async () => {
        if (!outputText) return;
        try {
            if (outputFormat === 'docx') {
                await downloadDocxFile(outputText, fileName);
            } else if (outputFormat === 'pdf') {
                downloadPdfFile(outputText, fileName);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to download file.');
        }
    };

    const handleClear = () => {
        setInputText('');
        clearOutput();
        setError(null);
        setFileName('humanized-text');
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const mockEvent = { target: { files: e.dataTransfer.files } } as unknown as React.ChangeEvent<HTMLInputElement>;
            handleFileChange(mockEvent);
        }
    };
    
    const getHighlightedOutput = () => {
        if (!outputText) {
            return <p className="whitespace-pre-wrap text-gray-400">Your rewritten text will appear here...</p>;
        }
        if (!showAnalysis || changes.length === 0) {
            return <p className="whitespace-pre-wrap">{outputText}</p>;
        }
        
        let highlightedText = outputText;
        changes.forEach((change, index) => {
            const placeholder = `__CHANGE_${index}__`;
            if (change.humanizedText.trim()) {
              highlightedText = highlightedText.replace(change.humanizedText, placeholder);
            }
        });

        const parts = highlightedText.split(/(__CHANGE_\d+__)/g);

        return (
            <p className="whitespace-pre-wrap">
                {parts.map((part, i) => {
                    const match = part.match(/__CHANGE_(\d+)__/);
                    if (match) {
                        const index = parseInt(match[1], 10);
                        const change = changes[index];
                        return (
                            <span key={i} className="relative" onMouseEnter={() => setActiveTooltip(index)} onMouseLeave={() => setActiveTooltip(null)}>
                                <mark className="bg-teal-400 text-gray-900 font-medium rounded-md mx-[-2px] px-[2px] cursor-pointer transition-colors hover:bg-teal-300">
                                    {change.humanizedText}
                                </mark>
                                <Tooltip change={change} isVisible={activeTooltip === index} />
                            </span>
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
            </p>
        );
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Header />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
                <div className="text-center mb-12">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
                        Humanize Your AI Text
                    </h1>
                    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
                        Transform robotic AI-generated text into natural, engaging content that connects with your audience.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Input Card */}
                    <div 
                        className="bg-gray-800/50 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-200">Original Text</h2>
                            <button onClick={handleClear} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Clear Text">
                                <TrashIcon className="w-5 h-5 text-gray-400"/>
                            </button>
                        </div>
                        <div className="relative flex-grow">
                            <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                placeholder="Paste your text here or drop a file..."
                                className="w-full h-full bg-gray-900/70 border border-gray-700 rounded-lg p-4 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors resize-none text-gray-300"
                                style={{ height: `${textAreasHeight}px` }}
                            />
                             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-600 pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                                <UploadIcon className="w-12 h-12 text-gray-500 mb-4" />
                                <p className="text-gray-400 font-semibold">Drop a file here</p>
                                <p className="text-gray-500 text-sm">.docx, .pdf, .txt</p>
                            </div>
                        </div>
                         <div
                            onMouseDown={handleResizeMouseDown}
                            className="w-full py-2 flex justify-center cursor-ns-resize group"
                            title="Drag to resize"
                        >
                            <div
                                className={`
                                    w-12 h-1.5 rounded-full transition-all duration-300 ease-out
                                    ${isResizing
                                        ? 'bg-cyan-400 h-2 shadow-lg shadow-cyan-400/50'
                                        : 'bg-gray-600 group-hover:bg-cyan-500 group-hover:h-2 group-hover:shadow-lg group-hover:shadow-cyan-500/50'
                                    }
                                `}
                            />
                        </div>
                        <div className="mt-2 flex flex-col sm:flex-row gap-4">
                            <button onClick={() => fileInputRef.current?.click()} className="flex-1 text-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                                <UploadIcon className="w-5 h-5"/>
                                Upload File
                            </button>
                             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.pdf,.txt" className="hidden" />
                        </div>
                    </div>

                    {/* Output Card */}
                    <div className="bg-gray-800/50 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                             <h2 className="text-xl font-semibold text-gray-200">Humanized Text</h2>
                             <div className="flex items-center gap-2">
                                {changes.length > 0 && (
                                    <button onClick={() => setShowAnalysis(!showAnalysis)} className={`p-2 rounded-full transition-colors ${showAnalysis ? 'bg-teal-500/20' : 'hover:bg-white/10'}`} title={showAnalysis ? "Hide Changes" : "Show Changes"}>
                                        <EyeIcon className={`w-5 h-5 ${showAnalysis ? 'text-teal-400' : 'text-gray-400'}`}/>
                                    </button>
                                )}
                                <button onClick={handleCopy} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Copy to Clipboard">
                                    <ClipboardIcon className="w-5 h-5 text-gray-400"/>
                                </button>
                                 <select
                                     value={outputFormat}
                                     onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                                     className="bg-gray-700 border-none rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value="docx">.docx</option>
                                    <option value="pdf">.pdf</option>
                                </select>
                                <button onClick={handleDownload} disabled={!outputText} className="p-2 rounded-full hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Download">
                                    <DownloadIcon className="w-5 h-5 text-gray-400"/>
                                </button>
                             </div>
                        </div>
                         <div className="w-full bg-gray-900/70 border border-gray-700 rounded-lg p-4 relative overflow-y-auto text-gray-300 flex-grow" style={{ height: `${textAreasHeight}px` }}>
                             {isLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader />
                                </div>
                             ) : (
                                getHighlightedOutput()
                             )}
                        </div>
                         <div
                            onMouseDown={handleResizeMouseDown}
                            className="w-full py-2 flex justify-center cursor-ns-resize group"
                            title="Drag to resize"
                        >
                            <div
                                className={`
                                    w-12 h-1.5 rounded-full transition-all duration-300 ease-out
                                    ${isResizing
                                        ? 'bg-cyan-400 h-2 shadow-lg shadow-cyan-400/50'
                                        : 'bg-gray-600 group-hover:bg-cyan-500 group-hover:h-2 group-hover:shadow-lg group-hover:shadow-cyan-500/50'
                                    }
                                `}
                            />
                        </div>
                        {isCopied && <div className="text-sm text-green-400 mt-2 text-right">Copied to clipboard!</div>}
                    </div>
                </div>

                <div className="mt-8 bg-gray-800/50 border border-white/10 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-semibold mb-4 text-center">Customize Your Output</h3>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 flex-wrap">
                        <div className="flex items-center gap-3">
                            <label htmlFor="tone-select" className="font-medium text-gray-300">Tone:</label>
                            <select
                                id="tone-select"
                                value={options.tone}
                                onChange={(e) => setOptions({ ...options, tone: e.target.value as Tone })}
                                className="bg-gray-700 border-none rounded-md py-2 px-3 focus:ring-2 focus:ring-cyan-500"
                            >
                                <option value="professional">Professional</option>
                                <option value="casual">Casual</option>
                                <option value="academic">Academic</option>
                                <option value="friendly">Friendly</option>
                                <option value="confident">Confident</option>
                                <option value="researcher">Researcher</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                             <label htmlFor="voice-select" className="font-medium text-gray-300">Voice:</label>
                             <select
                                id="voice-select"
                                value={options.voice}
                                onChange={(e) => setOptions({ ...options, voice: e.target.value as Voice })}
                                className="bg-gray-700 border-none rounded-md py-2 px-3 focus:ring-2 focus:ring-cyan-500"
                            >
                                <option value="first-person">First-person</option>
                                <option value="third-person">Third-person</option>
                                <option value="objective">Objective</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                id="expand-checkbox"
                                type="checkbox"
                                checked={options.expand}
                                onChange={(e) => setOptions({ ...options, expand: e.target.checked })}
                                className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 cursor-pointer"
                            />
                            <label htmlFor="expand-checkbox" className="font-medium text-gray-300 flex items-center gap-1.5 cursor-pointer">
                                <ArrowsPointingOutIcon className="w-5 h-5" />
                                Expand Text
                            </label>
                        </div>
                        <button
                            onClick={handleRewrite}
                            disabled={isLoading || !inputText.trim()}
                            className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white font-bold py-3 px-8 rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                            {isLoading ? 'Rewriting...' : 'Humanize'}
                        </button>
                    </div>
                </div>

                {stats && changes.length > 0 && (
                    <div className="mt-8 bg-gray-800/50 border border-white/10 rounded-2xl p-6 shadow-xl">
                        <div className="flex items-center justify-center mb-6">
                            <ChartBarIcon className="w-6 h-6 text-cyan-400 mr-3" />
                            <h3 className="text-xl font-semibold text-center">Humanization Analysis</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                                <p className="text-3xl font-bold text-cyan-400">{stats.totalChanges}</p>
                                <p className="text-sm text-gray-400">Total Changes</p>
                            </div>
                             <div className="bg-gray-900/50 p-4 rounded-lg">
                                <p className="text-3xl font-bold text-cyan-400">{stats.phrasesReplaced}</p>
                                <p className="text-sm text-gray-400">AI Phrases Replaced</p>
                            </div>
                             <div className="bg-gray-900/50 p-4 rounded-lg">
                                <p className="text-3xl font-bold text-cyan-400">{stats.contractionsAdded}</p>
                                <p className="text-sm text-gray-400">Contractions Added</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;