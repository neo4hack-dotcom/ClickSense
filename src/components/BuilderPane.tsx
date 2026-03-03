import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Table, BarChart2, PieChart, LineChart, Play, Save, Sparkles, Star, RefreshCw, Maximize2, Minimize2, Palette, ArrowUp, ArrowDown, Filter, RotateCcw, Search, Plus } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import clsx from 'clsx';

/** Format a cell value: integers and floats get a thousands separator. */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (typeof value !== 'string' && isFinite(n)) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 10 });
  }
  // String that looks purely numeric (no leading zeros, no scientific notation edge-cases)
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)) && !/^0\d/.test(value.trim())) {
    const parsed = Number(value);
    if (isFinite(parsed)) return parsed.toLocaleString(undefined, { maximumFractionDigits: 10 });
  }
  return String(value);
}

const SortableHeader: React.FC<{
  id: string,
  column: string,
  sortConfig: { key: string, direction: 'asc' | 'desc' } | null,
  onSort: (key: string) => void,
  onFilterClick: (key: string) => void,
  colors?: { bg?: string, text?: string },
  isFiltered?: boolean,
}> = ({ id, column, sortConfig, onSort, onFilterClick, colors, isFiltered }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: colors?.bg || '#f8fafc',
    color: colors?.text || '#1e293b',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <th 
      ref={setNodeRef} 
      style={style} 
      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-b border-slate-200 relative group select-none"
    >
      <div className="flex items-center justify-between gap-2">
        <div 
          className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden"
          onClick={() => onSort(column)}
        >
          <span className="truncate">{column}</span>
          {sortConfig?.key === column && (
            <span className="text-emerald-600 shrink-0">
              {sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            </span>
          )}
        </div>
        <div className={clsx("flex items-center gap-1 transition-opacity shrink-0", isFiltered ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          <button
            onClick={(e) => { e.stopPropagation(); onFilterClick(column); }}
            className={clsx("p-1 hover:bg-black/5 rounded", isFiltered ? "text-emerald-600" : "text-slate-400 hover:text-slate-600")}
            title="Filter"
          >
            <Filter size={14} />
          </button>
          <div {...attributes} {...listeners} className="cursor-grab p-1 hover:bg-black/5 rounded text-slate-400 hover:text-slate-600">
            <GripVertical size={14} />
          </div>
        </div>
      </div>
    </th>
  );
};
const SortableItem: React.FC<{ id: string, item: any, onRemove: () => void }> = ({ id, item, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-sm text-sm">
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600">
        <GripVertical size={14} />
      </button>
      <span className="font-medium text-slate-700">{item.name || (item.column === '*' ? 'All Records' : item.column)}</span>
      {item.agg && <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-mono">{item.agg}</span>}
      <button onClick={onRemove} className="ml-auto text-slate-400 hover:text-red-500">
        <X size={14} />
      </button>
    </div>
  );
}

export function BuilderPane() {
  const { schema, queryResult, queryConfig, setQueryConfig, setQueryResult, currentUser, savedQueries, setSavedQueries, tableMetadata, setTableMetadata, selectedTable, setSelectedTable } = useAppStore();
  const [visualType, setVisualType] = useState<'table' | 'bar' | 'line' | 'pie'>('table');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [suggestedVisual, setSuggestedVisual] = useState<'table' | 'bar' | 'line' | 'pie' | null>(null);
  const [isRefreshingSchema, setIsRefreshingSchema] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [columnColors, setColumnColors] = useState<Record<string, { bg?: string, text?: string }>>({});
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  
  const [fieldSearch, setFieldSearch] = useState('');

  // Row/Column dimension split
  const [rowDims, setRowDims] = useState<{name: string}[]>([]);
  const [colDims, setColDims] = useState<{name: string}[]>([]);

  // Pre-query WHERE filters
  const [preFilters, setPreFilters] = useState<{id: string, column: string, operator: string, value: string}[]>([]);

  // Output limit
  const [queryLimit, setQueryLimit] = useState<string>('100');

  // Custom Table State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [activeDragColumn, setActiveDragColumn] = useState<string | null>(null);

  // Initialize column order when results change
  useEffect(() => {
    if (queryResult && queryResult.length > 0) {
      const keys = Object.keys(queryResult[0]);
      // Only update if it's a completely new set of columns
      if (columnOrder.length === 0 || !keys.every(k => columnOrder.includes(k))) {
        setColumnOrder(keys);
      }
    } else {
      setColumnOrder([]);
    }
  }, [queryResult]);

  const tables = Object.keys(schema).sort((a, b) => {
    const favA = tableMetadata[a]?.is_favorite ? 1 : 0;
    const favB = tableMetadata[b]?.is_favorite ? 1 : 0;
    if (favA !== favB) return favB - favA;
    return a.localeCompare(b);
  });

  useEffect(() => {
    if (!selectedTable && tables.length > 0) {
      setSelectedTable(tables[0]);
    }
  }, [tables, selectedTable]);

  const handleTableSelect = (t: string) => {
    if (t !== selectedTable) {
      setSelectedTable(t);
      setQueryConfig({ dimensions: [], measures: [], filters: [] });
      setQueryResult([]);
    }
  };

  const toggleFavorite = async (tableName: string) => {
    const current = tableMetadata[tableName] || { description: '', is_favorite: false };
    const updated = { ...current, is_favorite: !current.is_favorite };
    setTableMetadata({ ...tableMetadata, [tableName]: updated });
    await fetch('/api/tables/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_name: tableName, ...updated })
    });
  };

  const updateDescription = async (tableName: string, description: string) => {
    const current = tableMetadata[tableName] || { description: '', is_favorite: false };
    const updated = { ...current, description };
    setTableMetadata({ ...tableMetadata, [tableName]: updated });
    await fetch('/api/tables/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_name: tableName, ...updated })
    });
  };

  // Visualization Recommendation Engine
  useEffect(() => {
    const allDims = [...rowDims, ...colDims];
    const dims = allDims.length;
    const meas = queryConfig.measures.length;

    if (dims === 0 && meas === 0) {
      setSuggestedVisual(null);
      return;
    }

    if (dims === 1 && meas >= 1) {
      const dimName = allDims[0].name.toLowerCase();
      if (dimName.includes('date') || dimName.includes('time') || dimName.includes('day') || dimName.includes('month') || dimName.includes('year')) {
        setSuggestedVisual('line');
      } else if (meas === 1 && (queryConfig.measures[0] as any).agg === 'count') {
        setSuggestedVisual('bar');
      } else {
        setSuggestedVisual('bar');
      }
    } else if (dims === 0 && meas > 0) {
      setSuggestedVisual('table');
    } else {
      setSuggestedVisual('table');
    }
  }, [rowDims, colDims, queryConfig.measures]);

  const handleApplySuggestion = () => {
    if (suggestedVisual) {
      setVisualType(suggestedVisual);
    }
  };

  const handleRefreshSchema = async () => {
    setIsRefreshingSchema(true);
    try {
      const res = await fetch('/api/schema');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      useAppStore.getState().setSchema(data.schema);
    } catch (error: any) {
      alert(`Failed to refresh schema: ${error.message}`);
    } finally {
      setIsRefreshingSchema(false);
    }
  };

  const handleClear = () => {
    setQueryConfig({ dimensions: [], measures: [], filters: [] });
    setQueryResult([]);
    setVisualType('table');
    setSortConfig(null);
    setFilters({});
    setActiveFilterColumn(null);
    setColumnOrder([]);
    setColumnColors({});
    setSuggestedVisual(null);
    setRowDims([]);
    setColDims([]);
    setPreFilters([]);
    setQueryLimit('100');
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent, type: 'rowDims' | 'colDims' | 'measures' | 'columns') => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveDragColumn(null);
      return;
    }

    if (type === 'columns') {
      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      setColumnOrder(arrayMove(columnOrder, oldIndex, newIndex));
      setActiveDragColumn(null);
    } else if (type === 'rowDims') {
      const oldIndex = rowDims.findIndex(i => i.name === active.id);
      const newIndex = rowDims.findIndex(i => i.name === over.id);
      setRowDims(arrayMove(rowDims, oldIndex, newIndex));
    } else if (type === 'colDims') {
      const oldIndex = colDims.findIndex(i => i.name === active.id);
      const newIndex = colDims.findIndex(i => i.name === over.id);
      setColDims(arrayMove(colDims, oldIndex, newIndex));
    } else if (type === 'measures') {
      const oldIndex = queryConfig.measures.findIndex((i: any) => i.column === active.id);
      const newIndex = queryConfig.measures.findIndex((i: any) => i.column === over.id);
      setQueryConfig({
        ...queryConfig,
        measures: arrayMove(queryConfig.measures as any[], oldIndex, newIndex),
      });
    }
  };

  const handleDragStart = (event: any) => {
    setActiveDragColumn(event.active.id);
  };

  const addRowDimension = (col: string) => {
    if (!rowDims.find(d => d.name === col) && !colDims.find(d => d.name === col)) {
      const newRowDims = [...rowDims, { name: col }];
      setRowDims(newRowDims);
      setQueryConfig({ ...queryConfig, dimensions: [...newRowDims, ...colDims] });
    }
  };

  const addColDimension = (col: string) => {
    if (!colDims.find(d => d.name === col) && !rowDims.find(d => d.name === col)) {
      const newColDims = [...colDims, { name: col }];
      setColDims(newColDims);
      setQueryConfig({ ...queryConfig, dimensions: [...rowDims, ...newColDims] });
    }
  };

  const addDimension = (col: string) => addRowDimension(col);

  const addMeasure = (col: string, agg: string = 'count') => {
    if (!queryConfig.measures.find((m: any) => m.column === col && m.agg === agg)) {
      setQueryConfig({ ...queryConfig, measures: [...queryConfig.measures, { column: col, agg }] });
    }
  };

  const removeRowDimension = (col: string) => {
    const newRowDims = rowDims.filter(d => d.name !== col);
    setRowDims(newRowDims);
    setQueryConfig({ ...queryConfig, dimensions: [...newRowDims, ...colDims] });
  };

  const removeColDimension = (col: string) => {
    const newColDims = colDims.filter(d => d.name !== col);
    setColDims(newColDims);
    setQueryConfig({ ...queryConfig, dimensions: [...rowDims, ...newColDims] });
  };

  const removeDimension = (col: string) => {
    removeRowDimension(col);
    removeColDimension(col);
  };

  const removeMeasure = (col: string, agg: string) => {
    setQueryConfig({
      ...queryConfig,
      measures: queryConfig.measures.filter((m: any) => !(m.column === col && m.agg === agg))
    });
  };

  const addPreFilter = () => {
    setPreFilters(prev => [...prev, { id: Date.now().toString(), column: '', operator: '=', value: '' }]);
  };

  const updatePreFilter = (id: string, field: string, val: string) => {
    setPreFilters(prev => prev.map(f => f.id === id ? { ...f, [field]: val } : f));
  };

  const removePreFilter = (id: string) => {
    setPreFilters(prev => prev.filter(f => f.id !== id));
  };

  const buildSql = () => {
    const table = selectedTable;
    if (!table) throw new Error("No table selected");
    const allDims = [...rowDims, ...colDims];
    const selects = [
      ...allDims.map(d => d.name),
      ...queryConfig.measures.map((m: any) => m.column === '*' ? `count(*) AS count_all` : `${m.agg}(${m.column}) AS ${m.agg}_${m.column}`)
    ];
    let sql = `SELECT ${selects.join(', ')} FROM ${table}`;
    const whereConditions = preFilters
      .filter(f => f.column && f.operator && (f.value !== '' || f.operator === 'IS NULL' || f.operator === 'IS NOT NULL'))
      .map(f => {
        if (f.operator === 'IS NULL') return `${f.column} IS NULL`;
        if (f.operator === 'IS NOT NULL') return `${f.column} IS NOT NULL`;
        const isLike = f.operator === 'LIKE' || f.operator === 'NOT LIKE';
        const isNum = !isLike && f.value !== '' && !isNaN(Number(f.value));
        const val = isNum ? f.value : `'${f.value.replace(/'/g, "''")}'`;
        return `${f.column} ${f.operator} ${val}`;
      });
    if (whereConditions.length > 0) sql += ` WHERE ${whereConditions.join(' AND ')}`;
    if (allDims.length > 0 && queryConfig.measures.length > 0) {
      sql += ` GROUP BY ${allDims.map(d => d.name).join(', ')}`;
    }
    const lim = parseInt(queryLimit, 10);
    if (!isNaN(lim) && lim > 0) sql += ` LIMIT ${lim}`;
    return sql;
  };

  const buildAndExecuteQuery = async () => {
    const allDims = [...rowDims, ...colDims];
    if (allDims.length === 0 && queryConfig.measures.length === 0) return;
    setIsExecuting(true);

    try {
      const sql = buildSql();

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setQueryResult(data.data);

      // Save to history
      if (currentUser) {
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, query_text: 'Built via Visual Builder', sql }),
        }).catch(console.error);
      }

    } catch (error: any) {
      alert(`Query Error: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveToDashboard = async () => {
    if (!currentUser) return alert("Please select a user first");
    const name = prompt("Enter a name for this visualization:");
    if (!name) return;

    setIsSaving(true);
    try {
      const sql = buildSql();

      await fetch('/api/saved_queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          name,
          sql,
          config: queryConfig,
          visual_type: visualType
        }),
      });
      
      // Refresh saved queries
      const res = await fetch(`/api/saved_queries/${currentUser.id}`);
      const data = await res.json();
      setSavedQueries(data);
      alert("Saved to dashboard!");
    } catch (e) {
      console.error(e);
      alert("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const renderVisual = () => {
    if (!queryResult || queryResult.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Table size={48} className="mb-4 opacity-20" />
          <p>No data to display. Run a query first.</p>
        </div>
      );
    }

    const keys = columnOrder.length > 0 ? columnOrder : Object.keys(queryResult[0]);
    // Try to guess dimension vs measure
    const dimKey = rowDims[0]?.name || colDims[0]?.name || keys[0];
    const measureKeys = keys.filter(k => k !== dimKey);

    // Apply sorting and filtering
    let processedData = [...queryResult];
    
    // Filter
    Object.entries(filters).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        processedData = processedData.filter(row => {
          const cellValue = row[key];
          if (cellValue == null) return false;
          return String(cellValue).toLowerCase().includes(lowerValue);
        });
      }
    });

    // Sort
    if (sortConfig) {
      processedData.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (aVal === bVal) return 0;
        
        const aIsNum = !isNaN(Number(aVal)) && aVal !== null && aVal !== '';
        const bIsNum = !isNaN(Number(bVal)) && bVal !== null && bVal !== '';
        
        let comparison = 0;
        if (aIsNum && bIsNum) {
          comparison = Number(aVal) - Number(bVal);
        } else {
          comparison = String(aVal || '').localeCompare(String(bVal || ''));
        }
        
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
      }
      setSortConfig({ key, direction });
    };

    switch (visualType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={queryResult}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey={dimKey} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
              <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
              {measureKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsLineChart data={queryResult}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey={dimKey} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
              <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
              {measureKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsPieChart>
              <Pie
                data={queryResult}
                dataKey={measureKeys[0]}
                nameKey={dimKey}
                cx="50%"
                cy="50%"
                outerRadius={150}
                innerRadius={80}
                paddingAngle={2}
              >
                {queryResult.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
            </RechartsPieChart>
          </ResponsiveContainer>
        );
      case 'table':
      default: {
        const hasActiveFilters = Object.values(filters).some(v => v);
        const showFilterRow = activeFilterColumn !== null || hasActiveFilters;

        return (
          <div className="flex flex-col h-full">
            {/* Color Picker Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Palette size={14} /> Style Columns:
              </span>
              {keys.map(key => (
                <div key={key} className="relative">
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === key ? null : key)}
                    className={clsx(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      showColorPicker === key ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {key}
                  </button>
                  {showColorPicker === key && (
                    <div className="absolute top-full left-0 mt-1 p-3 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col gap-3 min-w-[180px]">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Background Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={columnColors[key]?.bg || '#ffffff'}
                            onChange={(e) => setColumnColors(prev => ({ ...prev, [key]: { ...prev[key], bg: e.target.value } }))}
                            className="w-8 h-8 cursor-pointer rounded border border-slate-200 p-0"
                          />
                          <span className="text-xs text-slate-500 font-mono">{columnColors[key]?.bg || '#ffffff'}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Text Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={columnColors[key]?.text || '#000000'}
                            onChange={(e) => setColumnColors(prev => ({ ...prev, [key]: { ...prev[key], text: e.target.value } }))}
                            className="w-8 h-8 cursor-pointer rounded border border-slate-200 p-0"
                          />
                          <span className="text-xs text-slate-500 font-mono">{columnColors[key]?.text || '#000000'}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const newColors = { ...columnColors };
                          delete newColors[key];
                          setColumnColors(newColors);
                          setShowColorPicker(null);
                        }}
                        className="text-xs text-red-600 hover:bg-red-50 border border-red-200 p-1.5 rounded mt-1 font-medium transition-colors"
                      >
                        Reset to Default
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/*
             * Fix: wrap the whole table (not just <tr>) with the column DndContext
             * so DragOverlay can be placed outside the <table> element.
             * A <th> rendered by DragOverlay outside a <table> is invalid HTML
             * and causes layout issues — we use a <div> in the overlay instead.
             */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={(e) => handleDragEnd(e, 'columns')}
            >
              {/* Custom Table */}
              <div className="flex-1 overflow-auto border border-slate-200 rounded-lg bg-white shadow-sm min-h-0">
                <table className="w-full min-w-max text-sm text-left">
                  <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                    <tr>
                      <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
                        {keys.map(key => (
                          <SortableHeader
                            key={key}
                            id={key}
                            column={key}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            onFilterClick={(col) => setActiveFilterColumn(activeFilterColumn === col ? null : col)}
                            colors={columnColors[key]}
                            isFiltered={!!filters[key]}
                          />
                        ))}
                      </SortableContext>
                    </tr>
                    {/* Inline filter row — avoids floating popup positioning bugs */}
                    {showFilterRow && (
                      <tr className="bg-white border-b border-slate-100">
                        {keys.map(key => (
                          <th key={key} className="px-2 py-1.5">
                            <input
                              type="text"
                              placeholder={`Filter ${key}…`}
                              value={filters[key] || ''}
                              onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                              autoFocus={activeFilterColumn === key}
                              className="w-full text-xs p-1.5 border border-slate-200 rounded focus:ring-1 focus:ring-emerald-500 outline-none min-w-[60px] font-normal"
                            />
                          </th>
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedData.length > 0 ? (
                      processedData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          {keys.map(key => {
                            const colors = columnColors[key];
                            const style = colors ? {
                              backgroundColor: colors.bg ? `${colors.bg}20` : undefined,
                              color: colors.text,
                              fontWeight: colors.text ? '500' : 'normal'
                            } : {};

                            return (
                              <td key={key} className="px-4 py-2.5 whitespace-nowrap text-slate-600" style={style}>
                                {row[key] !== null && row[key] !== undefined ? formatCellValue(row[key]) : <span className="text-slate-300 italic">null</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={keys.length} className="px-4 py-8 text-center text-slate-500 italic">
                          No results match the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/*
               * Fix: DragOverlay is now outside the <table> so its portal-rendered
               * element is semantically valid. We render a <div> (not <th>).
               * Fix: dropAnimation must be a DropAnimation config object —
               * defaultDropAnimationSideEffects returns a SideEffect function and
               * must be assigned to the `sideEffects` key, not used directly.
               */}
              <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
                {activeDragColumn ? (
                  <div className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg rounded opacity-90">
                    {activeDragColumn}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {/* Status Bar */}
            <div className="mt-2 text-xs text-slate-500 flex justify-between items-center shrink-0">
              <span>Showing {processedData.length} of {queryResult.length} rows</span>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilters({}); setActiveFilterColumn(null); }}
                  className="text-emerald-600 hover:underline flex items-center gap-1"
                >
                  <X size={12} /> Clear all filters
                </button>
              )}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Configuration Bar — shrink-0 prevents it from being squashed by the results area */}
      <div className="bg-white border-b border-slate-200 p-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Visual Builder</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              disabled={queryConfig.dimensions.length === 0 && queryConfig.measures.length === 0 && (!queryResult || queryResult.length === 0)}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Clear all dimensions, measures and results"
            >
              <RotateCcw size={15} />
              Clear
            </button>
            <button
              onClick={handleSaveToDashboard}
              disabled={isSaving || !queryResult || queryResult.length === 0}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={buildAndExecuteQuery}
              disabled={isExecuting || ([...rowDims, ...colDims].length === 0 && queryConfig.measures.length === 0)}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Play size={16} />
              {isExecuting ? 'Running...' : 'Run Query'}
            </button>
          </div>
        </div>

        {/* Dimensions + Measures — 3 columns */}
        <div className="grid grid-cols-3 gap-3">
          {/* Rows Dropzone */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span> Rows
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'rowDims')}>
              <SortableContext items={rowDims.map(d => d.name)} strategy={verticalListSortingStrategy}>
                <div className="min-h-[40px] max-h-24 overflow-y-auto flex flex-wrap gap-2 pr-0.5">
                  {rowDims.length === 0 && (
                    <div className="text-sm text-slate-400 italic w-full text-center py-2 border-2 border-dashed border-slate-200 rounded-lg">
                      Drag fields here
                    </div>
                  )}
                  {rowDims.map((dim) => (
                    <SortableItem key={dim.name} id={dim.name} item={dim} onRemove={() => removeRowDimension(dim.name)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Columns Dropzone */}
          <div className="bg-slate-50 border border-purple-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"></span> Columns
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'colDims')}>
              <SortableContext items={colDims.map(d => d.name)} strategy={verticalListSortingStrategy}>
                <div className="min-h-[40px] max-h-24 overflow-y-auto flex flex-wrap gap-2 pr-0.5">
                  {colDims.length === 0 && (
                    <div className="text-sm text-slate-400 italic w-full text-center py-2 border-2 border-dashed border-purple-100 rounded-lg">
                      Drag fields here
                    </div>
                  )}
                  {colDims.map((dim) => (
                    <SortableItem key={dim.name} id={dim.name} item={dim} onRemove={() => removeColDimension(dim.name)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Measures Dropzone */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Measures (Values)
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'measures')}>
              <SortableContext items={queryConfig.measures.map((m: any) => m.column)} strategy={verticalListSortingStrategy}>
                <div className="min-h-[40px] max-h-24 overflow-y-auto flex flex-wrap gap-2 pr-0.5">
                  {queryConfig.measures.length === 0 && (
                    <div className="text-sm text-slate-400 italic w-full text-center py-2 border-2 border-dashed border-slate-200 rounded-lg">
                      Drag fields here
                    </div>
                  )}
                  {queryConfig.measures.map((measure: any) => (
                    <SortableItem key={measure.column} id={measure.column} item={measure} onRemove={() => removeMeasure(measure.column, measure.agg)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Filters + Limit row */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">WHERE</span>
          {preFilters.map(f => (
            <div key={f.id} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
              <select
                value={f.column}
                onChange={e => updatePreFilter(f.id, 'column', e.target.value)}
                className="text-xs border-none outline-none bg-transparent text-slate-700 max-w-[110px] cursor-pointer"
              >
                <option value="">column…</option>
                {selectedTable && schema[selectedTable]?.map((col: any) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={e => updatePreFilter(f.id, 'operator', e.target.value)}
                className="text-xs border-none outline-none bg-transparent text-emerald-700 font-mono cursor-pointer"
              >
                {['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL'].map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {!['IS NULL', 'IS NOT NULL'].includes(f.operator) && (
                <input
                  type="text"
                  value={f.value}
                  onChange={e => updatePreFilter(f.id, 'value', e.target.value)}
                  placeholder="value…"
                  className="text-xs border-none outline-none bg-transparent text-slate-700 w-20 placeholder:text-slate-300"
                />
              )}
              <button onClick={() => removePreFilter(f.id)} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={addPreFilter}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors font-medium shrink-0"
          >
            <Plus size={12} /> Filter
          </button>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LIMIT</span>
            <input
              type="number"
              min="1"
              value={queryLimit}
              onChange={e => setQueryLimit(e.target.value)}
              placeholder="∞"
              className="text-xs w-20 px-2 py-1 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-500 outline-none bg-white text-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Schema Sidebar */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full">
          {/* Table Selector */}
          <div className="p-4 border-b border-slate-200 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-800">Select Table</h3>
              <button 
                onClick={handleRefreshSchema}
                disabled={isRefreshingSchema}
                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-50"
                title="Refresh tables"
              >
                <RefreshCw size={14} className={isRefreshingSchema ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50">
              {tables.map(t => (
                <div 
                  key={t} 
                  onClick={() => handleTableSelect(t)}
                  className={clsx("px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-slate-100 border-b border-slate-100 last:border-0", selectedTable === t && "bg-emerald-50 text-emerald-700 font-medium")}
                >
                  <span className="truncate">{t}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(t); }}
                    className={clsx("shrink-0 p-1 rounded hover:bg-slate-200", tableMetadata[t]?.is_favorite ? "text-amber-400" : "text-slate-300")}
                  >
                    <Star size={14} fill={tableMetadata[t]?.is_favorite ? "currentColor" : "none"} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Metadata Editor */}
          {selectedTable && (
            <div className="p-4 border-b border-slate-200 shrink-0 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800 truncate">Table Metadata</h3>
              </div>
              <textarea 
                value={tableMetadata[selectedTable]?.description || ''}
                onChange={(e) => updateDescription(selectedTable, e.target.value)}
                placeholder="Describe this table functionally for the AI..."
                className="w-full text-xs p-2 border border-slate-200 rounded-lg resize-none h-20 focus:ring-1 focus:ring-emerald-500 bg-white"
              />
            </div>
          )}

          {/* Columns & Measures */}
          <div className="flex-1 overflow-y-auto p-4">
            {selectedTable && schema[selectedTable] && (
              <>
                {/* Suggested Measures */}
                <div className="mb-6">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested Measures</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => addMeasure('*', 'count')} className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-md hover:bg-emerald-200 transition-colors border border-emerald-200 shadow-sm">
                      Count Records
                    </button>
                    {schema[selectedTable].filter((c: any) => c.type.includes('Int') || c.type.includes('Float') || c.type.includes('Decimal')).slice(0, 4).map((col: any) => (
                      <button key={col.name} onClick={() => addMeasure(col.name, 'sum')} className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-md hover:bg-blue-200 transition-colors border border-blue-200 shadow-sm">
                        Sum {col.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Columns */}
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Columns</div>
                  {/* Field search */}
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search fields…"
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      className="w-full text-xs pl-6 pr-6 py-1.5 border border-slate-200 rounded-md focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-50"
                    />
                    {fieldSearch && (
                      <button onClick={() => setFieldSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  {(() => {
                    const filtered = schema[selectedTable].filter((col: any) =>
                      !fieldSearch || col.name.toLowerCase().includes(fieldSearch.toLowerCase())
                    );
                    if (filtered.length === 0) return (
                      <p className="text-xs text-slate-400 italic py-2 px-1">No fields match "{fieldSearch}"</p>
                    );
                    return (
                      <div className="space-y-1">
                        {filtered.map((col: any) => {
                          const isNumeric = col.type.includes('Int') || col.type.includes('Float') || col.type.includes('Decimal');
                          return (
                            <div key={col.name} className="group flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200 transition-all">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={clsx("w-2 h-2 rounded-full shrink-0", isNumeric ? "bg-blue-400" : "bg-emerald-400")} />
                                <span className="text-sm text-slate-700 truncate" title={col.name}>{col.name}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                <button onClick={() => addRowDimension(col.name)} className="text-[10px] font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded">Row</button>
                                <button onClick={() => addColDimension(col.name)} className="text-[10px] font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded">Col</button>
                                {isNumeric && (
                                  <button onClick={() => addMeasure(col.name, 'sum')} className="text-[10px] font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded">Sum</button>
                                )}
                                <button onClick={() => addMeasure(col.name, 'count')} className="text-[10px] font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded">Cnt</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Results Area — overflow-auto so content is reachable on small screens */}
        <div className="flex-1 p-6 overflow-auto bg-slate-50/50 flex flex-col gap-4 min-w-0">
          {suggestedVisual && suggestedVisual !== visualType && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-blue-700 text-sm">
                <Sparkles size={16} className="text-blue-500" />
                <span>AI Suggestion: A <strong>{suggestedVisual}</strong> chart might be the best way to visualize this data.</span>
              </div>
              <button 
                onClick={handleApplySuggestion}
                className="bg-white text-blue-600 hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm"
              >
                Apply Suggestion
              </button>
            </div>
          )}

          {(() => {
            // Results panel — rendered via portal when fullscreen so it escapes
            // parent overflow/stacking contexts and fully overlays the chat pane.
            const panel = (
              <div className={clsx(
                "bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col",
                isFullscreen
                  ? "fixed inset-0 z-[200] shadow-2xl rounded-none"
                  : "flex-1 rounded-2xl"
              )}>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                  <h3 className="text-sm font-semibold text-slate-800">Results</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                      {[
                        { id: 'table', icon: Table },
                        { id: 'bar', icon: BarChart2 },
                        { id: 'line', icon: LineChart },
                        { id: 'pie', icon: PieChart },
                      ].map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setVisualType(v.id as any)}
                          className={clsx(
                            "p-1.5 rounded-md transition-all",
                            visualType === v.id ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          <v.icon size={16} />
                        </button>
                      ))}
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                      title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    >
                      {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col overflow-hidden">
                  {renderVisual()}
                </div>
              </div>
            );
            return isFullscreen ? createPortal(panel, document.body) : panel;
          })()}
        </div>
      </div>
    </div>
  );
}
