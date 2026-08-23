<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Application, Container, Graphics, Text } from 'pixi.js';
import Button from '@/components/Button.vue';
import { formatDateTime } from '@/utils/format';
import { getKnowledgeChunkConfigs } from '@/api/knowledgeChunkConfig';
import {
  getKnowledgeBase,
  getKnowledgeBaseChunks,
  getKnowledgeBaseDocuments,
  createKnowledgeBaseChunk,
  updateKnowledgeBaseChunk,
  deleteKnowledgeBaseChunk,
  type KnowledgeBase,
  type KnowledgeBaseChunk,
} from '@/api/knowledgeBase';

type GridCoordinate = {
  row: number;
  column: number;
};

type ManualChunkDraft = {
  id: number | null;
  title: string;
  content: string;
  coreContent: string;
  start: GridCoordinate | null;
  end: GridCoordinate | null;
  manualStartOffset: number | null;
  manualEndOffset: number | null;
  contextBeforeLength: number;
  contextAfterLength: number;
};

type ManualSourceLine = {
  text: string;
  startOffset: number;
};

type ManualPixiState = {
  app: Application;
  backgroundLayer: Graphics;
  stateLayer: Graphics;
  textLayer: Container;
};

const props = defineProps<{
  row?: KnowledgeBase | null;
  categoryName?: string;
}>();

const MANUAL_GRID_CELL_WIDTH = 14;
const MANUAL_GRID_CELL_HEIGHT = 22;
const MANUAL_GRID_HEADER_HEIGHT = 0;
const MANUAL_GRID_LINE_WIDTH = 0;
const MANUAL_GRID_MAX_COLUMNS = 48;
const MANUAL_STAGE_PADDING = 6;
const MANUAL_TEXT_FONT = '14px "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
const MANUAL_WRAP_MAX_WIDTH = MANUAL_GRID_MAX_COLUMNS * MANUAL_GRID_CELL_WIDTH;
const DEFAULT_MANUAL_CONTEXT_OVERLAP = 120;
const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const detail = ref<KnowledgeBase | null>(null);
const rowData = computed(() => detail.value ?? props.row);
const activeTab = ref('basic');
const chunkKeyword = ref('');
const chunkLoading = ref(false);
const chunks = ref<KnowledgeBaseChunk[]>([]);
const chunkTotal = ref(0);
const chunkPage = ref(1);
const chunkPageSize = ref(10);
const activeDocumentId = ref<number | null>(null);
const manualEditorVisible = ref(false);
const manualLoading = ref(false);
const savingManualChunks = ref(false);
const manualSourceContent = ref('');
const manualSelectionStart = ref<GridCoordinate | null>(null);
const manualSelectionEnd = ref<GridCoordinate | null>(null);
const manualSelectionDragging = ref(false);
const manualChunks = ref<ManualChunkDraft[]>([]);
const manualPixiHostRef = ref<HTMLDivElement>();
const manualContextOverlap = ref(DEFAULT_MANUAL_CONTEXT_OVERLAP);
const manualMaxChunks = ref(500);
const manualCanvasReady = ref(false);
const parsedContent = computed(() => rowData.value?.contentText?.trim() || '');
// 仅允许 http(s) 协议的文件地址，避免注入 javascript: 等危险链接
const safeFileUrl = computed(() => {
  const url = rowData.value?.fileUrl || '';
  return /^https?:\/\//i.test(url) ? url : '';
});
const manualSourceRows = computed(() =>
  wrapManualSourceContent(manualSourceContent.value),
);
const manualSourceLines = computed(() =>
  manualSourceRows.value.map((item) => item.text),
);
const manualLineStartOffsets = computed(() =>
  manualSourceRows.value.map((item) => item.startOffset),
);
const manualGridRowCount = computed(() =>
  Math.max(1, manualSourceLines.value.length),
);
const manualGridColumnCount = computed(() => MANUAL_GRID_MAX_COLUMNS);
const manualStartLabel = computed(() =>
  manualSelectionStart.value ? getCoordinateLabel(manualSelectionStart.value) : '-',
);
const manualEndLabel = computed(() =>
  manualSelectionEnd.value ? getCoordinateLabel(manualSelectionEnd.value) : '-',
);
let manualPixiState: ManualPixiState | null = null;
let manualPixiInitPromise: Promise<ManualPixiState | null> | null = null;
let manualDrawFrame = 0;
let manualMeasureCanvas: HTMLCanvasElement | null = null;

function getContentTypeLabel(value?: KnowledgeBase['contentType']) {
  const map: Record<string, string> = {
    text: '文本',
    pdf: 'PDF',
    word: 'Word',
    image: '图片',
    file: '文件',
    mixed: '混合',
  };
  return value ? map[value] ?? value : '-';
}

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    success: '成功',
    failed: '失败',
  };
  return status ? map[status] ?? status : '-';
}

function getVectorStatusLabel(value?: string | null) {
  const map: Record<string, string> = {
    pending: '待向量化',
    processing: '向量化中',
    success: '已写入',
    failed: '失败',
    skipped: '未变化',
  };
  return map[value || 'pending'] || value || '-';
}

function getVectorStatusType(value?: string | null) {
  const map: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
    pending: 'info',
    processing: 'warning',
    success: 'success',
    failed: 'danger',
    skipped: 'info',
  };
  return map[value || 'pending'] || 'info';
}

async function fetchChunks() {
  if (!rowData.value?.id) return;
  chunkLoading.value = true;
  try {
    const res = await getKnowledgeBaseChunks({
      page: chunkPage.value,
      pageSize: chunkPageSize.value,
      knowledgeBaseId: rowData.value.id,
      keyword: chunkKeyword.value,
    });
    chunks.value = res.list;
    chunkTotal.value = res.total;
  } catch {
    ElMessage.error('获取分片列表失败');
  } finally {
    chunkLoading.value = false;
  }
}

async function fetchBaseDocument() {
  if (!rowData.value?.id) return null;
  const res = await getKnowledgeBaseDocuments({
    page: 1,
    pageSize: 20,
    knowledgeBaseId: rowData.value.id,
  });
  const document =
    res.list.find((item) => item.content?.trim()) ?? res.list[0] ?? null;
  activeDocumentId.value = document?.id ?? null;
  if (document?.content && detail.value) {
    detail.value.contentText = document.content;
  }
  return document;
}

async function prepareManualChunks() {
  manualLoading.value = true;
  try {
    const content = rowData.value?.contentText || parsedContent.value || '';
    if (!content) {
      ElMessage.warning('请先完成解析，生成可分片的正文内容');
      return;
    }
    const existed = rowData.value?.id
      ? await getKnowledgeBaseChunks({
          page: 1,
          pageSize: manualMaxChunks.value,
          knowledgeBaseId: rowData.value.id,
        })
      : { list: [] };
    await fetchManualChunkConfig();
    manualSourceContent.value = content.replace(/\r\n/g, '\n');
    manualChunks.value = buildExistingManualChunks(existed.list);
    clearManualSelection();
    manualCanvasReady.value = false;
    manualEditorVisible.value = true;
    await nextTick();
    await waitManualCanvasFrame();
    if (manualEditorVisible.value) {
      await drawManualGrid();
      manualCanvasReady.value = true;
    }
  } catch {
    ElMessage.error('手动分片初始化失败');
  } finally {
    manualLoading.value = false;
  }
}

async function fetchManualChunkConfig() {
  const manual = await getKnowledgeChunkConfigs({
    page: 1,
    pageSize: 1,
    chunkMode: 'manual',
  });
  const fallback = manual.list[0]
    ? manual
    : await getKnowledgeChunkConfigs({ page: 1, pageSize: 1 });
  manualContextOverlap.value = Number(
    fallback.list[0]?.chunkOverlap ?? DEFAULT_MANUAL_CONTEXT_OVERLAP,
  );
  manualMaxChunks.value = Number(fallback.list[0]?.manualMaxChunks ?? 500);
}

function buildExistingManualChunks(list: KnowledgeBaseChunk[]) {
  let searchStart = 0;
  return list.map((item) => {
    const content = (item.content || '').replace(/\r\n/g, '\n');
    const contextBeforeLength = Number(item.contextBeforeLength ?? 0);
    const contextAfterLength = Number(item.contextAfterLength ?? 0);
    const fallbackCoreContent =
      contextBeforeLength || contextAfterLength
        ? content.slice(
            contextBeforeLength,
            Math.max(contextBeforeLength, content.length - contextAfterLength),
          )
        : content;
    const coreContent = (item.coreContent || fallbackCoreContent).replace(/\r\n/g, '\n');
    const range =
      item.manualStartOffset !== null && item.manualEndOffset !== null
        ? {
            start: getCoordinateByOffset(item.manualStartOffset),
            end: getCoordinateByOffset(item.manualEndOffset),
          }
        : locateManualChunkRange(coreContent, searchStart);
    if (range) {
      // 自动分片可能带有重叠文本，所以下一个分片不一定在上一个分片结束后。
      searchStart = getCoordinateOffset(range.start) + 1;
    }
    return {
      id: item.id ?? null,
      title: item.title || '',
      content,
      coreContent,
      start: range?.start ?? null,
      end: range?.end ?? null,
      manualStartOffset: range ? getCoordinateOffset(range.start) : null,
      manualEndOffset: range ? getCoordinateOffset(range.end) : null,
      contextBeforeLength,
      contextAfterLength,
    };
  });
}

function locateManualChunkRange(content: string, fromIndex: number) {
  if (!content) return null;
  const startOffset = manualSourceContent.value.indexOf(content, fromIndex);
  if (startOffset < 0) return null;
  const endOffset = Math.max(startOffset, startOffset + content.length - 1);
  return {
    start: getCoordinateByOffset(startOffset),
    end: getCoordinateByOffset(endOffset),
  };
}

function wrapManualSourceContent(content: string): ManualSourceLine[] {
  if (!content) return [{ text: '', startOffset: 0 }];
  const rows: ManualSourceLine[] = [];
  let offset = 0;
  content.split('\n').forEach((line) => {
    if (!line.length) {
      rows.push({ text: '', startOffset: offset });
    }
    pushWrappedManualRows(rows, line, offset);
    offset += line.length + 1;
  });
  return rows.length ? rows : [{ text: '', startOffset: 0 }];
}

function pushWrappedManualRows(
  rows: ManualSourceLine[],
  text: string,
  startOffset: number,
) {
  if (!text) return;
  let currentText = '';
  let currentStartOffset = startOffset;

  const flush = () => {
    if (!currentText) return;
    rows.push({
      text: currentText,
      startOffset: currentStartOffset,
    });
    currentText = '';
  };

  const appendText = (value: string, valueOffset: number) => {
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      const charOffset = valueOffset + index;
      const nextText = currentText + char;
      if (
        currentText &&
        measureManualTextWidth(nextText) > MANUAL_WRAP_MAX_WIDTH
      ) {
        flush();
      }
      if (!currentText) currentStartOffset = charOffset;
      currentText += char;
    }
  };

  const appendLinkToken = (value: string, valueOffset: number) => {
    const tokenWidth = measureManualTextWidth(value);
    if (
      currentText &&
      measureManualTextWidth(currentText) + tokenWidth > MANUAL_WRAP_MAX_WIDTH
    ) {
      flush();
    }
    if (tokenWidth > MANUAL_WRAP_MAX_WIDTH) {
      appendText(value, valueOffset);
      return;
    }
    if (!currentText) currentStartOffset = valueOffset;
    currentText += value;
  };

  const linkPattern = /（链接：[^）]+）|https?:\/\/[^\s）)]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text))) {
    appendText(text.slice(cursor, match.index), startOffset + cursor);
    appendLinkToken(match[0], startOffset + match.index);
    cursor = match.index + match[0].length;
  }
  appendText(text.slice(cursor), startOffset + cursor);
  flush();
}

function getCoordinateLabel(coord: GridCoordinate) {
  return `R${coord.row + 1}C${coord.column + 1}`;
}

function getCoordinateOffset(coord: GridCoordinate) {
  return (manualLineStartOffsets.value[coord.row] ?? 0) + coord.column;
}

function getCoordinateByOffset(offset: number): GridCoordinate {
  const rows = manualSourceRows.value;
  let row = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const rowStart = rows[index].startOffset;
    const rowEnd = rowStart + Math.max(0, rows[index].text.length - 1);
    if (offset >= rowStart && offset <= rowEnd) {
      row = index;
      break;
    }
    if (rowStart <= offset) row = index;
    if (rowStart > offset) break;
  }
  const line = manualSourceLines.value[row] ?? '';
  const rowOffset = rows[row]?.startOffset ?? 0;
  return {
    row,
    column: Math.min(Math.max(0, offset - rowOffset), Math.max(0, line.length - 1)),
  };
}

function normalizeCoordinateRange(
  start: GridCoordinate,
  end: GridCoordinate,
) {
  return getCoordinateOffset(start) <= getCoordinateOffset(end)
    ? { start, end }
    : { start: end, end: start };
}

function getManualCanvasCoordinate(event: MouseEvent) {
  const host = manualPixiHostRef.value;
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const scaleX = manualPixiState?.app.renderer.width
    ? manualPixiState.app.renderer.width / rect.width
    : 1;
  const scaleY = manualPixiState?.app.renderer.height
    ? manualPixiState.app.renderer.height / rect.height
    : 1;
  const x = (event.clientX - rect.left) * scaleX - MANUAL_STAGE_PADDING;
  const y = (event.clientY - rect.top) * scaleY - MANUAL_STAGE_PADDING;
  if (x < MANUAL_GRID_LINE_WIDTH || y < MANUAL_GRID_HEADER_HEIGHT) return null;
  const row = Math.floor((y - MANUAL_GRID_HEADER_HEIGHT) / MANUAL_GRID_CELL_HEIGHT);
  const line = manualSourceLines.value[row] ?? '';
  const column = getManualColumnByMeasuredX(
    line,
    x - MANUAL_GRID_LINE_WIDTH,
  );
  if (column < 0 || row < 0 || row >= manualSourceLines.value.length) return null;
  if (column >= line.length) return null;
  return { row, column };
}

function getManualColumnByMeasuredX(line: string, x: number) {
  if (!line) return -1;
  if (x <= 0) return 0;
  for (let column = 0; column < line.length; column += 1) {
    const start = measureManualTextWidth(line.slice(0, column));
    const end = measureManualTextWidth(line.slice(0, column + 1));
    if (x >= start && x <= end) {
      return column;
    }
  }
  return line.length - 1;
}

function handleManualCanvasMouseDown(event: MouseEvent) {
  if (!manualCanvasReady.value) return;
  const coord = getManualCanvasCoordinate(event);
  if (!coord || isManualCoordinateLocked(coord)) return;
  manualSelectionDragging.value = true;
  manualSelectionStart.value = coord;
  manualSelectionEnd.value = coord;
}

function handleManualCanvasMouseMove(event: MouseEvent) {
  if (!manualCanvasReady.value) return;
  if (!manualSelectionDragging.value || !manualSelectionStart.value) return;
  const coord = getManualCanvasCoordinate(event);
  if (!coord || isManualCoordinateLocked(coord)) return;
  const range = normalizeCoordinateRange(manualSelectionStart.value, coord);
  manualSelectionStart.value = range.start;
  manualSelectionEnd.value = range.end;
}

function handleManualCanvasMouseUp() {
  const wasDragging = manualSelectionDragging.value;
  manualSelectionDragging.value = false;
  // 拖拽中挂起了渲染（见下方 watch 解耦），松开那一刻才一次性全量重绘
  if (wasDragging && manualEditorVisible.value) {
    scheduleManualGridDraw();
  }
}

function waitManualCanvasFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function isManualOffsetSelected(offset: number) {
  if (!manualSelectionStart.value) return false;
  const start = getCoordinateOffset(manualSelectionStart.value);
  const end = getCoordinateOffset(manualSelectionEnd.value ?? manualSelectionStart.value);
  return offset >= start && offset <= end;
}

function isManualOffsetBoundary(offset: number) {
  if (!manualSelectionStart.value) return false;
  const startIndex = getCoordinateOffset(manualSelectionStart.value);
  const endIndex = manualSelectionEnd.value
    ? getCoordinateOffset(manualSelectionEnd.value)
    : startIndex;
  return offset === startIndex || offset === endIndex;
}

function cloneManualChunks() {
  return manualChunks.value.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    coreContent: item.coreContent,
    start: item.start ? { ...item.start } : null,
    end: item.end ? { ...item.end } : null,
    manualStartOffset: item.manualStartOffset,
    manualEndOffset: item.manualEndOffset,
    contextBeforeLength: item.contextBeforeLength,
    contextAfterLength: item.contextAfterLength,
  }));
}

// 单条分片同步：创建 / 删除 / 改标题仅传输对应片段，降低接口数据压力
async function persistManualChunkCreate(draft: ManualChunkDraft) {
  if (!activeDocumentId.value) {
    await fetchBaseDocument();
  }
  if (!activeDocumentId.value) {
    ElMessage.warning('未找到可同步分片的文档');
    return false;
  }
  savingManualChunks.value = true;
  try {
    const created = await createKnowledgeBaseChunk({
      documentId: activeDocumentId.value,
      title: draft.title.trim(),
      content: draft.content,
      coreContent: draft.coreContent,
      manualStartOffset: draft.manualStartOffset ?? undefined,
      manualEndOffset: draft.manualEndOffset ?? undefined,
      contextBeforeLength: draft.contextBeforeLength,
      contextAfterLength: draft.contextAfterLength,
    });
    draft.id = created.id; // 回填持久化 id 供后续删除/修改使用
    ElMessage.success('分片已生成并同步');
    chunkPage.value = 1;
    void fetchChunks();
    return true;
  } catch {
    ElMessage.error('同步分片失败');
    return false;
  } finally {
    savingManualChunks.value = false;
  }
}

async function persistManualChunkRemove(draft: ManualChunkDraft) {
  if (!activeDocumentId.value) {
    await fetchBaseDocument();
  }
  if (!activeDocumentId.value) {
    ElMessage.warning('未找到可同步分片的文档');
    return false;
  }
  savingManualChunks.value = true;
  try {
    if (draft.id) {
      await deleteKnowledgeBaseChunk(draft.id);
    }
    ElMessage.success('分片已删除并同步');
    chunkPage.value = 1;
    void fetchChunks();
    return true;
  } catch {
    ElMessage.error('同步分片失败');
    return false;
  } finally {
    savingManualChunks.value = false;
  }
}

async function persistManualChunkTitle(draft: ManualChunkDraft) {
  if (!activeDocumentId.value) {
    await fetchBaseDocument();
  }
  if (!activeDocumentId.value) {
    ElMessage.warning('未找到可同步分片的文档');
    return false;
  }
  if (!draft.id) return true; // 尚未持久化，无需同步
  savingManualChunks.value = true;
  try {
    await updateKnowledgeBaseChunk(draft.id, { title: draft.title.trim() });
    ElMessage.success('分片标题已同步');
    chunkPage.value = 1;
    void fetchChunks();
    return true;
  } catch {
    ElMessage.error('同步分片失败');
    return false;
  } finally {
    savingManualChunks.value = false;
  }
}

async function createManualChunkFromSelection() {
  if (savingManualChunks.value) return;
  if (!manualCanvasReady.value) {
    ElMessage.warning('原文画布还在准备中，请稍后再操作');
    return;
  }
  if (!manualSelectionStart.value || !manualSelectionEnd.value) {
    ElMessage.warning('请选择分片起止坐标');
    return;
  }
  if (isManualRangeLocked(manualSelectionStart.value, manualSelectionEnd.value)) {
    ElMessage.warning('当前坐标范围已被其它分片占用');
    return;
  }
  if (manualChunks.value.length >= manualMaxChunks.value) {
    ElMessage.warning(
      `已达手动分片上限 ${manualMaxChunks.value} 条，请删除部分分片或调整分片配置`,
    );
    return;
  }
  const coreContent = getManualRangeContent(
    manualSelectionStart.value,
    manualSelectionEnd.value,
  );
  if (!coreContent.trim()) {
    ElMessage.warning('当前坐标范围没有有效内容');
    return;
  }
  const previousChunks = cloneManualChunks();
  const title = `${rowData.value?.name || '分片'} ${manualStartLabel.value}-${manualEndLabel.value}`;
  const range = normalizeCoordinateRange(
    manualSelectionStart.value,
    manualSelectionEnd.value,
  );
  const manualStartOffset = getCoordinateOffset(range.start);
  const manualEndOffset = getCoordinateOffset(range.end);
  const context = getManualContextContent(manualStartOffset, manualEndOffset);
  const draft: ManualChunkDraft = {
    id: null,
    title,
    content: context.content,
    coreContent,
    start: { ...range.start },
    end: { ...range.end },
    manualStartOffset,
    manualEndOffset,
    contextBeforeLength: context.beforeLength,
    contextAfterLength: context.afterLength,
  };
  manualChunks.value.push(draft);
  clearManualSelection();
  scheduleManualGridDraw();
  const synced = await persistManualChunkCreate(draft);
  if (!synced) {
    manualChunks.value = previousChunks;
    scheduleManualGridDraw();
  }
}

function clearManualSelection() {
  manualSelectionStart.value = null;
  manualSelectionEnd.value = null;
  manualSelectionDragging.value = false;
}

function getManualRangeContent(start: GridCoordinate, end: GridCoordinate) {
  const range = normalizeCoordinateRange(start, end);
  const startOffset = getCoordinateOffset(range.start);
  const endOffset = getCoordinateOffset(range.end);
  return manualSourceContent.value.slice(startOffset, endOffset + 1);
}

function getManualContextContent(startOffset: number, endOffset: number) {
  const overlap = Math.max(0, Number(manualContextOverlap.value || 0));
  const beforeStart = Math.max(0, startOffset - overlap);
  const afterEnd = Math.min(
    manualSourceContent.value.length - 1,
    endOffset + overlap,
  );
  const before = manualSourceContent.value.slice(beforeStart, startOffset);
  const core = manualSourceContent.value.slice(startOffset, endOffset + 1);
  const after = manualSourceContent.value.slice(endOffset + 1, afterEnd + 1);
  return {
    content: `${before}${core}${after}`,
    beforeLength: before.length,
    afterLength: after.length,
  };
}

function getManualChunkRange(chunk: ManualChunkDraft) {
  if (!chunk.start || !chunk.end) return null;
  return normalizeCoordinateRange(chunk.start, chunk.end);
}

// 排序后的锁定区间数组（按 start 升序），手动分片互不重叠，用于二分查找
const manualLockedRanges = computed(() =>
  manualChunks.value
    .map((chunk) => {
      const range = getManualChunkRange(chunk);
      if (!range) return null;
      const start = getCoordinateOffset(range.start);
      const end = getCoordinateOffset(range.end);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .filter((item): item is { start: number; end: number } => item !== null)
    .sort((a, b) => a.start - b.start),
);

// 二分查找：判断 offset 是否落在某个锁定区间内，O(log n)
function isOffsetLocked(offset: number) {
  const ranges = manualLockedRanges.value;
  if (ranges.length === 0) return false;
  // 找到 start <= offset 的最后一个区间
  let low = 0;
  let high = ranges.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (ranges[mid].start <= offset) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return ans !== -1 && offset <= ranges[ans].end;
}

// 二分查找：判断 [startOffset, endOffset] 是否与任一锁定区间相交，O(log n)
function isRangeLocked(startOffset: number, endOffset: number) {
  const ranges = manualLockedRanges.value;
  if (ranges.length === 0) return false;
  // 找到第一个 end >= startOffset 的区间
  let low = 0;
  let high = ranges.length - 1;
  let ans = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (ranges[mid].end >= startOffset) {
      ans = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return ans !== -1 && ranges[ans].start <= endOffset;
}

function isManualCoordinateLocked(coord: GridCoordinate) {
  return isOffsetLocked(getCoordinateOffset(coord));
}

function isManualRangeLocked(start: GridCoordinate, end: GridCoordinate) {
  const range = normalizeCoordinateRange(start, end);
  return isRangeLocked(
    getCoordinateOffset(range.start),
    getCoordinateOffset(range.end),
  );
}

function scheduleManualGridDraw() {
  if (manualDrawFrame) cancelAnimationFrame(manualDrawFrame);
  manualDrawFrame = requestAnimationFrame(() => {
    void drawManualGrid();
  });
}

async function ensureManualPixiState(width: number, height: number) {
  const host = manualPixiHostRef.value;
  if (!host) return null;
  if (manualPixiState) {
    manualPixiState.app.renderer.resize(width, height);
    return manualPixiState;
  }
  if (manualPixiInitPromise) {
    return manualPixiInitPromise;
  }

  const promise = (async () => {
    const app = new Application();
    await app.init({
      width,
      height,
      backgroundColor: 0xffffff,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
    });
    const backgroundLayer = new Graphics();
    const stateLayer = new Graphics();
    const textLayer = new Container();
    app.stage.addChild(backgroundLayer, stateLayer, textLayer);
    app.canvas.style.display = 'block';
    app.canvas.style.width = '100%';
    host.replaceChildren(app.canvas);
    manualPixiState = {
      app,
      backgroundLayer,
      stateLayer,
      textLayer,
    };
    return manualPixiState;
  })();
  manualPixiInitPromise = promise;
  // 初始化失败时重置，允许下次打开时重新创建
  promise.catch(() => {
    manualPixiInitPromise = null;
  });

  return promise;
}

async function drawManualGrid() {
  manualDrawFrame = 0;
  if (!manualEditorVisible.value) return;

  const columnCount = manualGridColumnCount.value;
  let contentWidth = MANUAL_GRID_LINE_WIDTH + columnCount * MANUAL_GRID_CELL_WIDTH;
  for (const line of manualSourceLines.value) {
    contentWidth = Math.max(contentWidth, measureManualTextWidth(line));
  }
  const width = Math.max(
    Math.ceil(contentWidth + MANUAL_STAGE_PADDING * 2),
    manualPixiHostRef.value?.clientWidth || 0,
  );
  const height =
    MANUAL_GRID_HEADER_HEIGHT +
    manualGridRowCount.value * MANUAL_GRID_CELL_HEIGHT +
    MANUAL_STAGE_PADDING * 2;
  const pixi = await ensureManualPixiState(width, height);
  if (!pixi || !manualEditorVisible.value) return;

  pixi.backgroundLayer
    .clear()
    .rect(0, 0, width, height)
    .fill({ color: 0xffffff });

  pixi.stateLayer.clear();
  destroyTextLayerChildren();

  // 行前缀累计宽度缓存，避免逐字符 measureText 造成的 O(n^2) 文本测量
  const linePrefixWidth = buildManualLinePrefixWidths();

  for (let row = 0; row < manualGridRowCount.value; row += 1) {
    const y =
      MANUAL_STAGE_PADDING +
      MANUAL_GRID_HEADER_HEIGHT +
      row * MANUAL_GRID_CELL_HEIGHT;
    const line = manualSourceLines.value[row] ?? '';
    // state 层只绘制与该行相交的锁定段 + 当前选区片段，跳过无关行
    drawManualPixiStateRangesForRow(pixi.stateLayer, row, line, y, linePrefixWidth[row] ?? []);
    addManualPixiLine(
      row,
      line,
      MANUAL_STAGE_PADDING + MANUAL_GRID_LINE_WIDTH,
      y + 2,
      linePrefixWidth[row] ?? [],
    );
  }
}

function addManualPixiLine(
  row: number,
  text: string,
  x: number,
  y: number,
  linePrefixWidth: number[],
) {
  if (!manualPixiState || !text) return;
  const segments = buildManualPixiTextSegments(row, text, linePrefixWidth);
  segments.forEach((segment) => {
    addManualPixiTextSegment(segment.text, x + segment.x, y, segment.color);
  });
}

function drawManualPixiStateRangesForRow(
  layer: Graphics,
  row: number,
  text: string,
  y: number,
  linePrefixWidth: number[],
) {
  // linePrefixWidth 为本行从行首到各列的累计宽度；只绘制与该行相交的锁定段 + 当前选区片段
  const rowStartOffset = manualLineStartOffsets.value[row] ?? 0;
  const rowEndOffset = rowStartOffset + text.length - 1;
  const lockedRanges = manualLockedRanges.value.filter(
    (item) => item.start <= rowEndOffset && item.end >= rowStartOffset,
  );
  const selectedRange =
    manualSelectionStart.value && manualSelectionEnd.value
      ? normalizeCoordinateRange(manualSelectionStart.value, manualSelectionEnd.value)
      : null;
  const selectedOffsets = selectedRange
    ? {
        start: getCoordinateOffset(selectedRange.start),
        end: getCoordinateOffset(selectedRange.end),
      }
    : null;

  const rects: Array<{ start: number; end: number; color: number; alpha: number }> = [];
  for (const item of lockedRanges) {
    const start = Math.max(item.start, rowStartOffset) - rowStartOffset;
    const end = Math.min(item.end, rowEndOffset) - rowStartOffset;
    rects.push({ start, end, color: 0xf4f4f5, alpha: 0.86 });
  }
  if (selectedOffsets) {
    const start = Math.max(selectedOffsets.start, rowStartOffset) - rowStartOffset;
    const end = Math.min(selectedOffsets.end, rowEndOffset) - rowStartOffset;
    if (start <= end) {
      rects.push({ start, end, color: 0xcfe7ff, alpha: 1 });
    }
  }
  if (rects.length === 0) return;

  for (const rect of rects) {
    const x =
      MANUAL_STAGE_PADDING +
      MANUAL_GRID_LINE_WIDTH +
      (linePrefixWidth[rect.start] ?? 0);
    const width = Math.max(6, measureManualTextWidth(text.slice(rect.start, rect.end + 1)));
    layer
      .rect(x, y + 2, width, MANUAL_GRID_CELL_HEIGHT - 4)
      .fill({
        color: rect.color,
        alpha: rect.alpha,
      });
  }
}

// 预计算每行从行首到各列的累计文本宽度，避免逐字符 measureText 的 O(n^2) 开销
function buildManualLinePrefixWidths() {
  return manualSourceLines.value.map((line) => {
    const widths: number[] = [0];
    let acc = 0;
    for (let column = 0; column < line.length; column += 1) {
      acc += measureManualTextWidth(line[column] === '\t' ? ' ' : line[column]);
      widths.push(acc);
    }
    return widths;
  });
}

function buildManualPixiTextSegments(
  row: number,
  text: string,
  linePrefixWidth: number[],
) {
  const segments: Array<{ text: string; x: number; color: number }> = [];
  let current = '';
  let currentStart = 0;
  let currentColor: number | null = null;

  for (let column = 0; column < text.length; column += 1) {
    const coord = { row, column };
    const color = getManualTextColor(coord);
    if (currentColor === null) {
      currentColor = color;
      currentStart = column;
    }
    if (color !== currentColor) {
      segments.push({
        text: current,
        x: linePrefixWidth[currentStart] ?? 0,
        color: currentColor,
      });
      current = '';
      currentColor = color;
      currentStart = column;
    }
    current += text[column] === '\t' ? ' ' : text[column];
  }

  if (current && currentColor !== null) {
    segments.push({
      text: current,
      x: linePrefixWidth[currentStart] ?? 0,
      color: currentColor,
    });
  }
  return segments;
}

function getManualTextColor(coord: GridCoordinate) {
  if (isManualCoordinateLocked(coord)) return 0x909399;
  const offset = getCoordinateOffset(coord);
  if (isManualOffsetSelected(offset)) return 0x1677d2;
  return 0x303133;
}

function addManualPixiTextSegment(text: string, x: number, y: number, color: number) {
  if (!manualPixiState || !text) return;
  const node = new Text({
    text,
    style: {
      fill: color,
      fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
      fontSize: 14,
    },
  });
  node.anchor.set(0, 0);
  node.position.set(x, y);
  manualPixiState.textLayer.addChild(node);
}

function measureManualTextWidth(text: string) {
  if (!text) return 0;
  manualMeasureCanvas ||= document.createElement('canvas');
  const context = manualMeasureCanvas.getContext('2d');
  if (!context) return text.length * MANUAL_GRID_CELL_WIDTH;
  context.font = MANUAL_TEXT_FONT;
  return context.measureText(text.replace(/\t/g, ' ')).width;
}

function destroyTextLayerChildren() {
  if (!manualPixiState) return;
  while (manualPixiState.textLayer.children.length) {
    const child = manualPixiState.textLayer.children[0];
    manualPixiState.textLayer.removeChild(child);
    child.destroy();
  }
}

function destroyManualPixiState() {
  if (manualDrawFrame) {
    cancelAnimationFrame(manualDrawFrame);
    manualDrawFrame = 0;
  }
  if (manualPixiState) {
    manualPixiState.app.destroy(true);
    manualPixiState = null;
  }
  manualPixiInitPromise = null;
  manualCanvasReady.value = false;
  manualPixiHostRef.value?.replaceChildren();
}

async function removeManualChunk(index: number) {
  if (savingManualChunks.value) return;
  const target = manualChunks.value[index];
  if (!target) return;
  const previousChunks = cloneManualChunks();
  manualChunks.value.splice(index, 1);
  scheduleManualGridDraw();
  const synced = await persistManualChunkRemove(target);
  if (!synced) {
    manualChunks.value = previousChunks;
    scheduleManualGridDraw();
  }
}

async function handleManualChunkTitleChange(draft: ManualChunkDraft) {
  if (savingManualChunks.value) return;
  await persistManualChunkTitle(draft);
}

function handleChunkSearch() {
  chunkPage.value = 1;
  void fetchChunks();
}

function handleTabChange(name: string | number) {
  if (name === 'chunks') {
    void fetchChunks();
  }
}

watch(visible, async (value) => {
  if (!value) {
    detail.value = null;
    destroyManualPixiState();
    return;
  }
  activeTab.value = 'basic';
  chunkKeyword.value = '';
  chunkPage.value = 1;
  chunks.value = [];
  chunkTotal.value = 0;
  activeDocumentId.value = null;
  manualEditorVisible.value = false;
  manualCanvasReady.value = false;
  manualChunks.value = [];
  manualSourceContent.value = '';
  clearManualSelection();
  if (!props.row?.id) return;
  loading.value = true;
  try {
    detail.value = await getKnowledgeBase(props.row.id);
  } catch {
    ElMessage.error('获取知识库详情失败');
  } finally {
    loading.value = false;
  }
});

watch(
  [manualSourceContent, manualSelectionStart, manualSelectionEnd, manualEditorVisible],
  () => {
    if (!manualEditorVisible.value) return;
    // 拖拽过程中只更新选区 ref，不触发重绘；渲染在 mouseup 一次性完成
    if (manualSelectionDragging.value) return;
    void nextTick(scheduleManualGridDraw);
  },
);

onBeforeUnmount(() => {
  destroyManualPixiState();
  manualMeasureCanvas = null;
});
</script>

<template>
  <el-drawer
    v-model="visible"
    title="查看知识库"
    size="100%"
    append-to-body
    destroy-on-close
  >
    <el-tabs
      v-loading="loading"
      v-model="activeTab"
      class="knowledge-base-view"
      @tab-change="handleTabChange"
    >
      <el-tab-pane label="基础信息" name="basic">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">
            {{ rowData?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="所属分类">
            {{ props.categoryName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="rowData?.isEnabled ? 'success' : 'info'">
              {{ rowData?.isEnabled ? '启用' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="命中关键字">
            {{ rowData?.hitKeywords || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="口语化描述">
            {{ rowData?.colloquialDescription || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="匹配优先级">
            {{ rowData?.matchPriority ?? 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="内容类型">
            {{ getContentTypeLabel(rowData?.contentType) }}
          </el-descriptions-item>
          <el-descriptions-item label="处理阶段">
            {{ rowData?.processStage || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="解析状态">
            {{ getStatusLabel(rowData?.parseStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="分片状态">
            {{ getStatusLabel(rowData?.chunkStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="索引状态">
            {{ getStatusLabel(rowData?.indexStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="处理消息">
            {{ rowData?.lastProcessMessage || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane label="内容" name="content">
        <div class="knowledge-base-view__content-toolbar">
          <Button
            type="primary"
            icon="Edit"
            :loading="manualLoading"
            :confirm="false"
            @click="prepareManualChunks"
          >
            手动分片
          </Button>
        </div>

        <div
          v-if="parsedContent && !manualEditorVisible"
          class="knowledge-base-view__text"
        >
          {{ parsedContent }}
        </div>
        <el-empty
          v-else-if="!manualEditorVisible"
          description="暂无解析正文"
        />

        <div v-if="safeFileUrl" class="knowledge-base-view__file">
          <span>原文件：</span>
          <el-link
            type="primary"
            :href="safeFileUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ rowData?.fileName || '下载文件' }}
          </el-link>
        </div>

        <div v-if="manualEditorVisible" class="knowledge-base-view__manual">
          <div class="knowledge-base-view__manual-head">
            <div>
              <strong>手动分片编辑</strong>
              <div class="knowledge-base-view__manual-coordinate">
                <span>起点：{{ manualStartLabel }}</span>
                <span>终点：{{ manualEndLabel }}</span>
              </div>
            </div>
            <div class="knowledge-base-view__manual-actions">
              <Button :confirm="false" @click="clearManualSelection">
                清空坐标
              </Button>
              <Button
                type="primary"
                icon="Plus"
                :confirm="false"
                :disabled="savingManualChunks || !manualCanvasReady"
                :loading="savingManualChunks"
                @click="createManualChunkFromSelection"
              >
                生成分片
              </Button>
            </div>
          </div>

          <div class="knowledge-base-view__manual-body">
            <div class="knowledge-base-view__manual-source">
              <div class="knowledge-base-view__manual-subtitle">原文内容</div>
              <div class="knowledge-base-view__grid">
                <div
                  ref="manualPixiHostRef"
                  class="knowledge-base-view__grid-stage"
                  @mousedown="handleManualCanvasMouseDown"
                  @mousemove="handleManualCanvasMouseMove"
                  @mouseup="handleManualCanvasMouseUp"
                  @mouseleave="handleManualCanvasMouseUp"
                />
                <div v-if="!manualCanvasReady" class="knowledge-base-view__grid-mask">
                  <div class="knowledge-base-view__grid-mask-title">原文画布准备中</div>
                  <div class="knowledge-base-view__grid-mask-text">稍等片刻后即可拖拽选择分片区域</div>
                </div>
              </div>
            </div>

            <div class="knowledge-base-view__manual-result">
              <div class="knowledge-base-view__manual-result-head">
                <div>
                  <div class="knowledge-base-view__manual-subtitle">分好的片段</div>
                  <div class="knowledge-base-view__manual-count">
                    共 {{ manualChunks.length }} / {{ manualMaxChunks }} 个分片，上下文重叠 {{ manualContextOverlap }} 字符
                  </div>
                </div>
              </div>

              <div v-if="manualChunks.length" class="knowledge-base-view__manual-list">
                <div
                  v-for="(item, index) in manualChunks"
                  :key="index"
                  class="knowledge-base-view__manual-item"
                >
                  <div class="knowledge-base-view__manual-item-head">
                    <el-input
                      v-model="item.title"
                      placeholder="分片标题"
                      clearable
                      :disabled="savingManualChunks"
                      @change="handleManualChunkTitleChange(item)"
                    />
                    <el-tag v-if="item.start && item.end" type="info">
                      {{ getCoordinateLabel(item.start) }} -
                      {{ getCoordinateLabel(item.end) }}
                    </el-tag>
                    <Button
                      type="danger"
                      :confirm="false"
                      :disabled="savingManualChunks"
                      @click="removeManualChunk(index)"
                    >
                      删除
                    </Button>
                  </div>
                  <pre class="knowledge-base-view__manual-preview">{{ item.content }}</pre>
                </div>
              </div>
              <el-empty v-else description="暂无手动分片" />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="分片内容" name="chunks">
        <div class="knowledge-base-view__chunk-toolbar">
          <el-input
            v-model="chunkKeyword"
            clearable
            placeholder="搜索标题/内容"
            @keyup.enter="handleChunkSearch"
          />
          <Button type="primary" icon="Search" :confirm="false" @click="handleChunkSearch">
            查询
          </Button>
          <Button
            :confirm="false"
            @click="
              chunkKeyword = '';
              handleChunkSearch();
            "
          >
            重置
          </Button>
        </div>

        <el-table v-loading="chunkLoading" :data="chunks" border stripe>
          <el-table-column prop="chunkIndex" label="序号" width="90" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="content" label="内容" min-width="420">
            <template #default="{ row }">
              <div class="knowledge-base-view__chunk-content">
                {{ row.content || '-' }}
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="tokenCount" label="字符数" width="100" />
          <el-table-column prop="vectorStatus" label="向量状态" width="120">
            <template #default="{ row }">
              <el-tooltip
                v-if="row.vectorError"
                :content="row.vectorError"
                placement="top"
              >
                <el-tag :type="getVectorStatusType(row.vectorStatus)">
                  {{ getVectorStatusLabel(row.vectorStatus) }}
                </el-tag>
              </el-tooltip>
              <el-tag v-else :type="getVectorStatusType(row.vectorStatus)">
                {{ getVectorStatusLabel(row.vectorStatus) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="vectorizedAt" label="向量化时间" width="180">
            <template #default="{ row }">
              {{ row.vectorizedAt ? formatDateTime(row.vectorizedAt) : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="{ row }">
              {{ row.updatedAt ? formatDateTime(row.updatedAt) : '-' }}
            </template>
          </el-table-column>
        </el-table>

        <div class="knowledge-base-view__pagination">
          <el-pagination
            v-model:current-page="chunkPage"
            v-model:page-size="chunkPageSize"
            :total="chunkTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="fetchChunks"
            @size-change="handleChunkSearch"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <div class="knowledge-base-view__footer">
        <Button @click="visible = false">关闭</Button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.knowledge-base-view {
  min-height: 100%;
}

.knowledge-base-view__text {
  min-height: 320px;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.knowledge-base-view__content-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.knowledge-base-view__file {
  display: flex;
  align-items: center;
  margin-top: 12px;
  min-height: 48px;
}

.knowledge-base-view__manual {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #dcdfe6;
}

.knowledge-base-view__manual-head,
.knowledge-base-view__manual-item-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.knowledge-base-view__manual-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.knowledge-base-view__manual-coordinate {
  display: flex;
  gap: 16px;
  margin-top: 6px;
  color: #606266;
  font-size: 12px;
}

.knowledge-base-view__manual-actions {
  display: flex;
  gap: 8px;
}

.knowledge-base-view__manual-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.knowledge-base-view__manual-source,
.knowledge-base-view__manual-result {
  min-width: 0;
}

.knowledge-base-view__manual-result {
  padding-left: 16px;
  border-left: 1px solid #dcdfe6;
}

.knowledge-base-view__manual-subtitle {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
}

.knowledge-base-view__manual-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.knowledge-base-view__manual-count {
  color: #909399;
  font-size: 12px;
}

.knowledge-base-view__grid {
  position: relative;
  overflow: auto;
  max-height: 460px;
  padding: 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #ffffff;
  box-sizing: border-box;
}

.knowledge-base-view__grid-stage {
  display: block;
  width: 100%;
  cursor: pointer;
  user-select: none;
}

.knowledge-base-view__grid-mask {
  position: absolute;
  inset: 6px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  color: #606266;
  pointer-events: auto;
}

.knowledge-base-view__grid-mask-title {
  margin-bottom: 6px;
  color: #303133;
  font-weight: 600;
}

.knowledge-base-view__grid-mask-text {
  font-size: 12px;
}

.knowledge-base-view__manual-list {
  overflow: visible;
}

.knowledge-base-view__manual-item {
  padding: 12px 0;
  border-top: 1px solid #ebeef5;
}

.knowledge-base-view__manual-item:first-of-type {
  border-top: 0;
}

.knowledge-base-view__manual-item-head {
  margin-bottom: 8px;
}

.knowledge-base-view__manual-preview {
  padding: 8px;
  margin: 0;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafafa;
  color: #303133;
  font-size: 14px;
  line-height: 1.3;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1200px) {
  .knowledge-base-view__manual-body {
    grid-template-columns: 1fr;
  }

  .knowledge-base-view__manual-result {
    padding-left: 0;
    margin-top: 16px;
    border-left: 0;
  }
}

.knowledge-base-view__chunk-toolbar {
  display: flex;
  gap: 12px;
  max-width: 560px;
  margin-bottom: 12px;
}

.knowledge-base-view__chunk-content {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
}

.knowledge-base-view__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.knowledge-base-view__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
