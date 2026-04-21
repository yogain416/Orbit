export const CATEGORIES = [
  { value: null, label: '없음', color: 'bg-slate-200 text-slate-600', dot: 'bg-slate-400' },
  { value: 'work', label: '업무', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { value: 'personal', label: '개인', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  { value: 'exercise', label: '운동', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { value: 'other', label: '기타', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
]

export function getCategoryInfo(value) {
  return CATEGORIES.find((c) => c.value === value) || CATEGORIES[0]
}
