export default function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Màn hình này sẽ được hoàn thiện ở các bước tiếp theo.</p>
    </div>
  )
}
