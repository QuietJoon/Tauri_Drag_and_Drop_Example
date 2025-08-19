import "./App.css";
import { DragDropZone } from "./components/DragDropZone";

function App() {
  return (
    <main className="container">
      <h1>Drag & Drop example</h1>

      <DragDropZone title="Drop files into the app" />
    </main>
  );
}

export default App;
