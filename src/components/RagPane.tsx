import { useState, useRef, useEffect } from 'react';
import {
  Send, Bot, Loader2, Layers, Trash2, BookOpen, AlertCircle,
  ChevronDown, ChevronUp, Upload, CheckCircle2, Sparkles
} from 'lucide-react';
import { useAppStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

interface Source {
  title: string;
  score: number;
  excerpt: string;
  folder_id?: number;
}

interface RagMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  error?: boolean;
}

export function RagPane() {
  const { ragConfig, knowledgeFolders, setKnowledgeFolders } = useAppStore();
  const [messages, setMessages] = useState<RagMsg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'chat' | 'index'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/knowledge/folders')
      .then(res => res.json())
      .then(data => setKnowledgeFolders(data))
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setInput('');
    const userMsg: RagMsg = { role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userText,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          ragConfig,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error, error: true }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
        }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection error: ${e.message}`, error: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIndexFolders = async () => {
    setIsIndexing(true);
    setIndexResult(null);
    try {
      const res = await fetch('/api/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ragConfig }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIndexResult(`Indexed ${data.indexed} chunks from ${data.folders} folders successfully.`);
    } catch (e: any) {
      setIndexResult(`Error: ${e.message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const toggleSources = (idx: number) => {
    setExpandedSources(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  };

  const scoreColor = (score: number) => {
    if (score >= 0.8) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 0.6) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-purple-100 p-1.5 rounded-lg text-purple-600">
              <Layers size={16} />
            </div>
            <h2 className="font-bold text-slate-800 text-base">RAG Assistant</h2>
          </div>
          <p className="text-xs text-slate-500">Retrieval-Augmented Generation from your knowledge base</p>
        </div>

        {/* Panel tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActivePanel('chat')}
            className={clsx("flex-1 py-2.5 text-xs font-medium transition-colors", activePanel === 'chat' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-700')}
          >
            Chat
          </button>
          <button
            onClick={() => setActivePanel('index')}
            className={clsx("flex-1 py-2.5 text-xs font-medium transition-colors", activePanel === 'index' ? 'text-purple-600 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-700')}
          >
            Index
          </button>
        </div>

        {activePanel === 'index' ? (
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Index Knowledge Folders</h3>
              <p className="text-xs text-slate-500">
                This will embed all knowledge folder content and push them to Elasticsearch for vector similarity search.
              </p>
              <div className="text-xs text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>ES Host:</span>
                  <span className="font-mono text-slate-700 truncate max-w-[120px]">{ragConfig.esHost}</span>
                </div>
                <div className="flex justify-between">
                  <span>Index:</span>
                  <span className="font-mono text-slate-700">{ragConfig.esIndex}</span>
                </div>
                <div className="flex justify-between">
                  <span>Embedding:</span>
                  <span className="font-mono text-slate-700">{ragConfig.embeddingModel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Folders:</span>
                  <span className="font-mono text-slate-700">{knowledgeFolders.length}</span>
                </div>
              </div>
              <button
                onClick={handleIndexFolders}
                disabled={isIndexing || knowledgeFolders.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isIndexing ? (
                  <><Loader2 size={14} className="animate-spin" /> Indexing...</>
                ) : (
                  <><Upload size={14} /> Index Folders to ES</>
                )}
              </button>
              {indexResult && (
                <div className={clsx("flex items-start gap-2 p-3 rounded-lg text-xs", indexResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                  {indexResult.startsWith('Error') ? <AlertCircle size={14} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
                  {indexResult}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Folders ({knowledgeFolders.length})</h4>
              <div className="space-y-1.5">
                {knowledgeFolders.map(f => (
                  <div key={f.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                    <BookOpen size={13} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-slate-700 truncate">{f.title}</span>
                  </div>
                ))}
                {knowledgeFolders.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No folders. Add them in Knowledge Base.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-3">
              <div className="bg-purple-50 rounded-xl p-3 text-xs text-purple-700 space-y-1">
                <p className="font-semibold">How RAG works here:</p>
                <ol className="list-decimal list-inside space-y-1 text-purple-600">
                  <li>Your question is embedded into a vector</li>
                  <li>Elasticsearch finds the closest knowledge chunks</li>
                  <li>Top-{ragConfig.topK} results enrich the prompt</li>
                  <li>LLM generates a contextualized answer</li>
                </ol>
              </div>
              <div className="text-xs text-slate-500 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Model:</span>
                  <span className="font-mono">{ragConfig.embeddingModel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Top-K:</span>
                  <span className="font-mono">{ragConfig.topK}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Index:</span>
                  <span className="font-mono text-xs truncate max-w-[120px]">{ragConfig.esIndex}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => setMessages([])}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={12} /> Clear conversation
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-slate-50">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-purple-500">
                <Sparkles size={28} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-1">RAG Knowledge Search</h3>
                <p className="text-slate-500 text-sm max-w-md">
                  Ask questions and get answers enriched by your indexed knowledge base via semantic similarity search.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "Describe the structure of the orders table",
                  "What business rules apply to active users?",
                  "How is revenue calculated?",
                ].map((s, i) => (
                  <button key={i} onClick={() => setInput(s)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-full text-xs text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-colors shadow-sm">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}
            >
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === 'user' ? "bg-blue-500 text-white text-xs font-bold" : "bg-purple-500 text-white"
              )}>
                {msg.role === 'user' ? 'U' : <Bot size={15} />}
              </div>
              <div className={clsx(
                "max-w-[78%] space-y-2",
                msg.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={clsx(
                  "rounded-2xl p-4 shadow-sm text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-blue-500 text-white rounded-tr-none"
                    : msg.error
                    ? "bg-red-50 border border-red-200 text-red-700 rounded-tl-none"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="ml-0">
                    <button
                      onClick={() => toggleSources(i)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-purple-600 transition-colors"
                    >
                      <BookOpen size={12} />
                      {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} used
                      {expandedSources.has(i) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <AnimatePresence>
                      {expandedSources.has(i) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-2 space-y-2"
                        >
                          {msg.sources.map((src, j) => (
                            <div key={j} className="bg-white border border-slate-200 rounded-xl p-3 text-xs shadow-sm">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                  <BookOpen size={11} className="text-amber-500" />
                                  {src.title}
                                </span>
                                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium border", scoreColor(src.score))}>
                                  {(src.score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <p className="text-slate-500 leading-relaxed line-clamp-3">{src.excerpt}</p>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center shrink-0">
                <Bot size={15} />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                <Loader2 className="animate-spin text-purple-500" size={15} />
                <span className="text-xs text-slate-500">Searching knowledge base and generating answer...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question — semantic search will find the best knowledge..."
              className="w-full bg-slate-50 border border-slate-200 rounded-full pl-5 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2.5 bg-purple-500 text-white rounded-full hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
