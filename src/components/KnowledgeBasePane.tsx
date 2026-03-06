import { useState, useEffect } from 'react';
import { BookOpen, Plus, Save, Trash2, Edit3, CheckCircle2, FolderOpen, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore, KnowledgeFolder } from '../store';
import { motion, AnimatePresence } from 'motion/react';

export function KnowledgeBasePane() {
  const { knowledgeFolders, setKnowledgeFolders } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editingFolder, setEditingFolder] = useState<KnowledgeFolder | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolder, setNewFolder] = useState({ title: '', content: '' });
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/knowledge/folders')
      .then(res => res.json())
      .then(data => setKnowledgeFolders(data));
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newFolder.title.trim()) return;
    try {
      const res = await fetch('/api/knowledge/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFolder),
      });
      const data = await res.json();
      setKnowledgeFolders([...knowledgeFolders, data]);
      setNewFolder({ title: '', content: '' });
      setIsCreating(false);
      setExpandedIds(prev => new Set([...prev, data.id]));
    } catch {
      alert('Failed to create folder');
    }
  };

  const handleUpdate = async (folder: KnowledgeFolder) => {
    setSavingId(folder.id);
    try {
      await fetch(`/api/knowledge/folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: folder.title, content: folder.content }),
      });
      setKnowledgeFolders(knowledgeFolders.map(f => f.id === folder.id ? folder : f));
      setEditingFolder(null);
      setSavedId(folder.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      alert('Failed to save folder');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this folder?')) return;
    await fetch(`/api/knowledge/folders/${id}`, { method: 'DELETE' });
    setKnowledgeFolders(knowledgeFolders.filter(f => f.id !== id));
    setExpandedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Knowledge Base</h2>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Organize business context into titled folders. Each folder's title is used for similarity matching during AI queries — allowing fast, precise retrieval without reading full content.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="shrink-0 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Folder
        </button>
      </div>

      {/* Create folder form */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-white rounded-2xl border-2 border-emerald-200 shadow-sm overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/50">
              <div className="flex items-center gap-2 text-emerald-700">
                <FolderOpen size={18} />
                <span className="font-semibold text-sm">New Folder</span>
              </div>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">
                  Title <span className="text-emerald-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFolder.title}
                  onChange={e => setNewFolder({ ...newFolder, title: e.target.value })}
                  placeholder="Ex: Description de la table orders"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  autoFocus
                />
                <p className="mt-1 text-xs text-slate-400">Used for similarity search — be descriptive (e.g., "Description de la table orders")</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1 block">Content</label>
                <textarea
                  value={newFolder.content}
                  onChange={e => setNewFolder({ ...newFolder, content: e.target.value })}
                  placeholder="Describe the table, its columns, business rules, relationships..."
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-y"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newFolder.title.trim()}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save size={14} />
                  Create Folder
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder list */}
      {knowledgeFolders.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
          <BookOpen size={36} className="mb-3 opacity-20" />
          <p className="text-sm">No folders yet. Create your first knowledge folder.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {knowledgeFolders.map(folder => {
            const isExpanded = expandedIds.has(folder.id);
            const isEditing = editingFolder?.id === folder.id;

            return (
              <div key={folder.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Folder header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => !isEditing && toggleExpand(folder.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    )}
                    <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600 shrink-0">
                      <FolderOpen size={15} />
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingFolder.title}
                        onChange={e => setEditingFolder({ ...editingFolder, title: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-sm font-semibold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold text-slate-800 text-sm truncate">{folder.title}</span>
                    )}
                    {savedId === folder.id && (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleUpdate(editingFolder!)}
                          disabled={savingId === folder.id}
                          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                          <Save size={12} />
                          {savingId === folder.id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingFolder(null)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingFolder({ ...folder }); setExpandedIds(prev => new Set([...prev, folder.id])); }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit folder"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(folder.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete folder"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Folder content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 p-4">
                        {isEditing ? (
                          <textarea
                            value={editingFolder.content}
                            onChange={e => setEditingFolder({ ...editingFolder, content: e.target.value })}
                            rows={10}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-y"
                            placeholder="Describe tables, columns, business rules..."
                          />
                        ) : (
                          <pre className="text-sm text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
                            {folder.content || <span className="text-slate-400 italic not-italic font-sans">No content yet. Click edit to add.</span>}
                          </pre>
                        )}
                        <div className="mt-2 text-xs text-slate-400">
                          Updated {new Date(folder.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
