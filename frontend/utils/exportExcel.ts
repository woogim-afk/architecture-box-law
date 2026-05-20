import * as XLSX from 'xlsx';
import { ReviewResult } from '@/types';

export function exportToExcel(result: ReviewResult, projectName: string) {
  const rows: Record<string, string>[] = [];

  result.categories.forEach(cat => {
    cat.items.forEach(item => {
      rows.push({
        '카테고리': cat.name,
        '검토항목': item.name,
        '판정':     item.status === 'pass' ? '적합' : item.status === 'fail' ? '부적합' : '검토필요',
        '상세내용': item.detail,
        '근거법령': item.law,
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 25 },
    { wch: 10 },
    { wch: 50 },
    { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '법규검토결과');
  XLSX.writeFile(wb, `${projectName}_건축법규검토.xlsx`);
}
