import type { DriveAccount } from '../types'

interface Props {
  drives: DriveAccount[]
  selectedDriveId: string | null
  onSelect: (id: string | null) => void
}

const DriveChip = ({ drives, selectedDriveId, onSelect }: Props) => (
  <div className="flex flex-wrap items-center gap-2">
    <button
      onClick={() => onSelect(null)}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        selectedDriveId === null
          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
      }`}
    >
      All Drives
    </button>
    {drives.map((drive) => (
      <button
        key={drive._id}
        onClick={() => onSelect(drive._id)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          selectedDriveId === drive._id
            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
        }`}
      >
        {drive.profilePicture && (
          <img src={drive.profilePicture} alt="" className="h-4 w-4 rounded-full" />
        )}
        <span className="max-w-44 truncate">{drive.accountName || drive.accountEmail}</span>
      </button>
    ))}
  </div>
)

export default DriveChip
