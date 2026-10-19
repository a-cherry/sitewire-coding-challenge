type PaginationProps = {
  pageIndex: number
  pageCount: number
  onPageChange: (pageIndex: number) => void
}

export function Pagination({ pageIndex, pageCount, onPageChange }: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex - 1)}>
        Prev
      </button>
      <span>
        Page {pageIndex + 1} of {pageCount}
      </span>
      <button
        type="button"
        disabled={pageIndex === pageCount - 1}
        onClick={() => onPageChange(pageIndex + 1)}
      >
        Next
      </button>
    </nav>
  )
}
