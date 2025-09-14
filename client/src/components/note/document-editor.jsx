import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import '../quill-custom.css';

/**
 * DocumentEditor - ReactQuill wrapper with custom toolbar configuration
 * Handles the rich text editor with collaborative editing capabilities
 */
export default function DocumentEditor({ quillRef, onTextChange }) {
  const toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'script': 'sub' }, { 'script': 'super' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'font': [] }],
    [{ 'align': [] }],
    ['clean'],
  ];

  const modules = {
    toolbar: toolbarOptions,
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 quill-container">
        <ReactQuill
          ref={quillRef}
          modules={modules}
          theme="snow"
          onChange={onTextChange}
          placeholder="Start writing your note..."
        />
      </div>
    </div>
  );
}