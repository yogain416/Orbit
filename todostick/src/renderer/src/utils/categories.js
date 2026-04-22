export const DEFAULT_CATEGORIES = [
  { id: 'work', label: '업무', color: '#3B82F6' },
  { id: 'personal', label: '개인', color: '#22C55E' },
  { id: 'exercise', label: '운동', color: '#F97316' },
  { id: 'other', label: '기타', color: '#94A3B8' },
]

export const PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#22C55E', '#10B981', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#EC4899', '#94A3B8',
]

export function getCategoryById(id, categories) {
  return (categories?.length ? categories : DEFAULT_CATEGORIES).find((c) => c.id === id) || null
}

// 카테고리 pill 인라인 스타일 헬퍼
export function categoryStyle(color, selected = false) {
  return {
    backgroundColor: color + (selected ? '30' : '18'),
    color,
    borderColor: selected ? color : 'transparent',
  }
}
