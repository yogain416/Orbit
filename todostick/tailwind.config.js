/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,html}'],
  // 'class' 전략 — <html>에 .dark 토글로 다크모드 on/off (utils/theme.js가 제어).
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'system-ui',
          'sans-serif'
        ]
      },
      // Pretendard Variable(45~920)의 미세 weight를 활용 — 한글이 영문보다 가늘게 보이는 점을 보정해
      // 전체적으로 표준 weight보다 살짝 위로 시프트한다. Tailwind class 이름은 그대로 사용 가능.
      fontWeight: {
        thin: '200',
        extralight: '300',
        light: '400',
        normal: '500',
        medium: '600',
        semibold: '680',
        bold: '780',
        extrabold: '860',
        black: '920'
      },
      letterSpacing: {
        tighter: '-0.04em',
        tight: '-0.02em',
        normal: '-0.005em',
        wide: '0.015em',
        wider: '0.03em',
        widest: '0.08em'
      }
    }
  },
  plugins: []
}
