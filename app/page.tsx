import { createGroupAction } from "./actions/create-group";
import { CreateGroupForm } from "./components/create-group-form";

export default function HomePage() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <p className="eyebrow">Good company. Great watching.</p>
        <h1>WatchNext</h1>
        <p className="page-introduction">Less deciding, more watching. Bring the things you want to watch together in one shared list.</p>
      </div>
      <CreateGroupForm action={createGroupAction} />
    </div>
  );
}
