import type { DriveAccount } from '../types'
import Avatar from './Avatar'
import { username } from '../utils/username'

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
        <Avatar src={drive.profilePicture} email={drive.accountEmail} className="h-5 w-5 text-[10px]" />
        <span className="max-w-44 truncate" title={drive.accountEmail}>{username(drive.accountEmail)}</span>
      </button>
    ))}
  </div>
)

export default DriveChip
