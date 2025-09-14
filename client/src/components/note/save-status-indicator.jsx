/**
 * SaveStatusIndicator - Floating save status indicator (Google Docs style)
 * Shows current save status with appropriate styling and animations
 */
export default function SaveStatusIndicator({ saveStatus }) {
  // Don't render if document is saved
  if (saveStatus === 'saved') {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-30">
      <div className={`px-3 py-2 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 border ${
        saveStatus === 'saving' 
          ? 'bg-amber-100/90 text-amber-700 border-amber-200' 
          : 'bg-red-100/90 text-red-700 border-red-200'
      }`}>
        <span className="text-xs font-medium">
          {saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
        </span>
      </div>
    </div>
  );
}