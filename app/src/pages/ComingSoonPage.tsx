interface ComingSoonPageProps {
  title: string
}

export default function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">{title}</h1>
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-6 py-12 text-center">
        <p className="text-sm text-gray-500">{title} coming soon!</p>
      </div>
    </div>
  )
}
