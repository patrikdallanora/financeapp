export function CardPremium({ children, className = '', onClick }) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        card-premium w-full rounded-[28px] p-4 text-left
        ${onClick ? 'transition active:scale-[0.99]' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  )
}