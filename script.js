// ===================== 1. SETUP =====================

const STORAGE_KEY = "taskflow-tasks";   // name used to save data in localStorage

// Grab the HTML elements we need
const form = document.getElementById("taskForm");
const titleInput = document.getElementById("taskTitle");
const dateInput = document.getElementById("taskDate");
const priorityInput = document.getElementById("taskPriority");
const titleError = document.getElementById("titleError");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const filterButtons = document.querySelectorAll(".filter-btn");
const taskList = document.getElementById("taskList");
const emptyMessage = document.getElementById("emptyMessage");
const toast = document.getElementById("toast");

// Application state (the data the app remembers)
let tasks = loadTasks();       // array of task objects
let currentFilter = "all";     // "all" | "pending" | "completed"
let editingId = null;          // id of the task being edited (null = adding new)
let toastTimer;                // used to hide the toast after a delay

// A task looks like this:
// { id: 1700000000000, title: "Buy milk", dueDate: "2025-01-31",
//   priority: "high", completed: false, createdAt: 1700000000000 }


// ===================== 2. LOCAL STORAGE =====================

// Read tasks from the browser. localStorage only stores text, so we convert with JSON.parse.
function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];   // if the saved data is damaged, start fresh
  }
}

// Save the tasks array as text with JSON.stringify.
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}


// ===================== 3. HELPER FUNCTIONS =====================

// Show a small message at the bottom of the screen for 2.5 seconds
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

// Stops user text from being treated as HTML (prevents broken layout / XSS)
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Turn "2025-01-31" into "31 Jan 2025"
function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
}

// A pending task is overdue if its due date is before today
function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}


// ===================== 4. ADD / EDIT / DELETE / TOGGLE =====================

// Runs when the form is submitted (used for both adding and editing)
function handleSubmit(event) {
  event.preventDefault();   // stop the page from reloading

  const title = titleInput.value.trim();   // trim() removes spaces at the start/end

  // Prevent empty tasks
  if (title === "") {
    titleError.hidden = false;
    titleInput.classList.add("invalid");
    titleInput.focus();
    return;
  }
  hideError();

  if (editingId === null) {
    addTask(title);
  } else {
    updateTask(title);
  }
  resetForm();
  render();
}

function addTask(title) {
  tasks.push({
    id: Date.now(),                 // unique number based on the current time
    title: title,
    dueDate: dateInput.value,       // "" if no date chosen
    priority: priorityInput.value,
    completed: false,
    createdAt: Date.now()
  });
  saveTasks();
  showToast("Task added");
}

function updateTask(title) {
  const task = tasks.find(t => t.id === editingId);
  task.title = title;
  task.dueDate = dateInput.value;
  task.priority = priorityInput.value;
  saveTasks();
  showToast("Task edited");
}

// Put the task's values into the form so the user can change them
function startEdit(id) {
  const task = tasks.find(t => t.id === id);
  editingId = id;
  titleInput.value = task.title;
  dateInput.value = task.dueDate;
  priorityInput.value = task.priority;
  formTitle.textContent = "Edit task";
  submitBtn.textContent = "Save changes";
  cancelBtn.hidden = false;
  hideError();
  titleInput.focus();
  render();   // highlights the task being edited
}

function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  tasks = tasks.filter(t => t.id !== id);   // keep every task except this one
  if (editingId === id) resetForm();
  saveTasks();
  showToast("Task deleted");
  render();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  task.completed = !task.completed;
  saveTasks();
  showToast(task.completed ? "Task completed" : "Task marked as pending");
  render();
}

function resetForm() {
  form.reset();
  priorityInput.value = "medium";
  editingId = null;
  formTitle.textContent = "Add a task";
  submitBtn.textContent = "Add task";
  cancelBtn.hidden = true;
  hideError();
}

function hideError() {
  titleError.hidden = true;
  titleInput.classList.remove("invalid");
}


// ===================== 5. SEARCH, FILTER, SORT =====================

// Returns only the tasks that should be shown, in the right order
function getVisibleTasks() {
  const searchText = searchInput.value.trim().toLowerCase();

  // 1. Filter by status and search text
  let result = tasks.filter(task => {
    const matchesFilter =
      currentFilter === "all" ||
      (currentFilter === "pending" && !task.completed) ||
      (currentFilter === "completed" && task.completed);
    const matchesSearch = task.title.toLowerCase().includes(searchText);
    return matchesFilter && matchesSearch;
  });

  // 2. Sort
  const sortBy = sortSelect.value;
  const priorityRank = { high: 3, medium: 2, low: 1 };

  result.sort((a, b) => {
    if (sortBy === "due") {
      // earliest date first; tasks without a date go to the bottom
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (sortBy === "priority") {
      return priorityRank[b.priority] - priorityRank[a.priority];   // high first
    }
    return b.createdAt - a.createdAt;   // newest first
  });

  return result;
}


// ===================== 6. DISPLAY (RENDER) =====================

// Builds the HTML for one task card
function createTaskHtml(task) {
  const overdue = isOverdue(task);
  const dueText = task.dueDate
    ? `<span class="${overdue ? "overdue" : ""}">Due ${formatDate(task.dueDate)}${overdue ? " (overdue)" : ""}</span>`
    : `<span>No due date</span>`;

  return `
    <li class="task ${task.completed ? "completed" : ""} ${task.id === editingId ? "editing" : ""}">
      <button class="check" data-action="toggle" data-id="${task.id}"
              aria-label="Mark as ${task.completed ? "pending" : "completed"}">${task.completed ? "&#10003;" : ""}</button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span class="badge badge-${task.priority}">${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
          ${dueText}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" data-id="${task.id}">Edit</button>
        <button class="icon-btn delete" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    </li>`;
}

// Updates the three numbers at the top
function renderStats() {
  const completed = tasks.filter(t => t.completed).length;
  document.getElementById("statTotal").textContent = tasks.length;
  document.getElementById("statCompleted").textContent = completed;
  document.getElementById("statPending").textContent = tasks.length - completed;
}

// Redraws everything on the screen. Called after every change.
function render() {
  const visible = getVisibleTasks();
  taskList.innerHTML = visible.map(createTaskHtml).join("");

  // Friendly message when there is nothing to show
  if (visible.length === 0) {
    emptyMessage.hidden = false;
    emptyMessage.textContent = tasks.length === 0
      ? "No tasks yet. Add your first task to get started."
      : "No tasks match your search or filter.";
  } else {
    emptyMessage.hidden = true;
  }

  renderStats();
}


// ===================== 7. EVENT LISTENERS =====================

form.addEventListener("submit", handleSubmit);

cancelBtn.addEventListener("click", () => {
  resetForm();
  render();
});

titleInput.addEventListener("input", hideError);
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);

// Filter buttons: All / Pending / Completed
filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

// One listener for the whole list ("event delegation"):
// works for buttons that are created later by render()
taskList.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;

  if (action === "toggle") toggleTask(id);
  if (action === "edit") startEdit(id);
  if (action === "delete") deleteTask(id);
});

// Show saved tasks when the page first loads
render();