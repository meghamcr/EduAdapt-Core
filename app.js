const SUPABASE_URL = "https://cehjqggcuyqgkwlafkig.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nKr8PWPeNoez0uNvDu8inA_HHdFDz3I";
const hasSupabase = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_SUPABASE") && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";
const supabaseClient = hasSupabase && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
    teacher: null,
    students: [],
    classes: [],
    quizzes: [],
    progress: [],
    files: [],
    events: [],
    tickets: [],
    attendance: [],
    assignments: [],
    notifications: [],
    studentQueries: [],
    studentWork: [],
    selectedClass: "All Classes",
    workClass: "6th A",
    calendarDate: new Date(),
    chart: null,
    analysisChart: null,
    localMode: false
};

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const teacherKey = () => state.teacher?.id || state.teacher?.schoolId || "guest";
const localKey = name => `eduadapt_${name}_${teacherKey()}`;

window.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
    loadLocalStore();
    bindStaticControls();
    applyTheme();
    if (window.lucide) lucide.createIcons();

    if (localStorage.getItem("eduadapt_demo_mode") === "true") {
        const previewTeacher = JSON.parse(localStorage.getItem("eduadapt_teacher") || "null");
        state.teacher = previewTeacher;
        state.localMode = true;
        await enterPortal();
        return;
    }

    if (supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        if (data.session) {
            state.teacher = { id: data.session.user.id, email: data.session.user.email };
            await loadTeacherProfile();

            if (!state.teacher.name) {
                await supabaseClient.auth.signOut();
                window.location.href = "login.html";
                return;
            }

            await enterPortal();
            return;
        }
    }

    const savedTeacher = JSON.parse(localStorage.getItem("eduadapt_teacher") || "null");
    if (savedTeacher && (localStorage.getItem("eduadapt_table_session") === "true" || !supabaseClient)) {
        state.teacher = savedTeacher;
        state.localMode = !supabaseClient;
        await enterPortal();
        return;
    }

    window.location.href = "login.html";
}

function bindStaticControls() {
    $("#loginForm")?.addEventListener("submit", signInTeacher);
    $("#logoutBtn")?.addEventListener("click", logoutTeacher);
    $("#darkModeBtn")?.addEventListener("click", toggleTheme);
    $("#globalSearch")?.addEventListener("input", event => renderStudents(event.target.value));
    $("#classSelector")?.addEventListener("change", event => {
        state.selectedClass = event.target.value;
        renderAll();
    });

    $$(".nav-item").forEach(button => button.addEventListener("click", () => {
        $$(".nav-item").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        showPage(button.dataset.page);
    }));

    $("#openQuizModalBtn")?.addEventListener("click", openQuizModal);
    $("#createQuizQuickBtn")?.addEventListener("click", openQuizModal);
    $("#quizForm")?.addEventListener("submit", saveQuiz);
    $("#addStudentBtn")?.addEventListener("click", openStudentModal);
    $("#studentForm")?.addEventListener("submit", saveStudent);
    $("#assignmentForm")?.addEventListener("submit", submitAssignment);
    $("#studentWorkForm")?.addEventListener("submit", submitStudentWork);
    $("#studentInteractionForm")?.addEventListener("submit", submitStudentQuery);
    $("#editPrefBtn")?.addEventListener("click", editPreferences);
    $("#createAssessmentBtn")?.addEventListener("click", openQuizModal);
    $("#saveAttendanceBtn")?.addEventListener("click", saveAttendance);
    $("#openWorkPortalBtn")?.addEventListener("click", () => {
        $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === "workPortal"));
        showPage("workPortal");
    });
    $("#openReportPageBtn")?.addEventListener("click", () => openAnalysisPage("report"));
    $("#openGraphAnalysisBtn")?.addEventListener("click", () => openAnalysisPage("graphAnalysis"));
    $("#reportClassSelect")?.addEventListener("change", event => {
        populateReportStudentSelect(event.target.value);
        resetReportOutput("Select a student, then click Analyze & Build Report.");
    });
    $("#reportStudentSelect")?.addEventListener("change", () => resetReportOutput("Click Analyze & Build Report to create the evidence-based report."));
    $("#generateReportPageBtn")?.addEventListener("click", renderStudentReportPage);
    $("#printStudentReportBtn")?.addEventListener("click", () => window.print());
    $("#downloadStudentReportPdfBtn")?.addEventListener("click", downloadStudentReportPdf);
    $("#analysisClassSelect")?.addEventListener("change", renderClassAnalysis);

    $$(".modal-close").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
    window.addEventListener("click", event => {
        if (event.target.classList.contains("modal")) event.target.classList.remove("open");
    });

    initializeFileUpload();
    initializeWorkPortalControls();
    initializeCalendar();
    initializeAdminTickets();
    initializeChatbot();
}

function initializeWorkPortalControls() {
    $$(".work-class-badge").forEach(button => button.addEventListener("click", () => {
        const selected = button.dataset.workClass;
        state.workClass = selected;
        $$(".work-class-badge").forEach(item => item.classList.toggle("active", item.dataset.workClass === selected));
        const label = $("#workPortalClassLabel");
        if (label) label.textContent = selected;
        renderWorkPortal();
    }));

    const classSelect = $("#workFormClassSelect");
    if (classSelect) {
        classSelect.addEventListener("change", () => populateStudentWorkDropdown());
    }

    $("#studentWorkAttachment")?.addEventListener("change", event => {
        const fileName = event.target.files?.[0]?.name;
        if (fileName) $("#studentWorkAttachment").setAttribute("data-filename", fileName);
    });
}

function getClassOptions() {
    const defaults = ["6th A","6th B","7th A","7th B","8th A","8th B","9th A","9th B","10th A","10th B"];
    const names = [...new Set([
        ...defaults,
        ...state.classes.map(record => record.grade ? `${record.grade}${record.section ? ` ${record.section}` : ""}` : (record.name || record.class_name || record.class_section || "")),
        ...state.students.map(classValue),
        state.teacher?.className,
        state.workClass
    ].filter(Boolean).map(formatClassName))];

    return names.sort((left, right) => {
        const order = { "6th": 1, "7th": 2, "8th": 3, "9th": 4, "10th": 5 };
        const leftNumber = Number(String(left).replace(/[^0-9]/g, ""));
        const rightNumber = Number(String(right).replace(/[^0-9]/g, ""));
        const leftSection = String(left).includes("A") ? 1 : 2;
        const rightSection = String(right).includes("A") ? 1 : 2;
        const leftGrade = String(left).replace(/\s.*$/, "");
        const rightGrade = String(right).replace(/\s.*$/, "");
        return (order[leftGrade] || 99) - (order[rightGrade] || 99) || (leftNumber - rightNumber) || (leftSection - rightSection);
    });
}

function formatClassName(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    const match = text.match(/^(6|7|8|9|10)(?:th|st|nd|rd)?\s*([AB])$/i);
    return match ? `${match[1]}th ${match[2].toUpperCase()}` : text;
}

function renderWorkClassFilters() {
    const container = $("#workClassGrid");
    if (!container) return;
    const classes = getClassOptions();
    container.innerHTML = classes.map(item => `<button class="work-class-badge ${state.workClass === item ? "active" : ""}" data-work-class="${escapeHTML(item)}">${escapeHTML(item)}</button>`).join("");
    $$(".work-class-badge").forEach(button => button.addEventListener("click", () => {
        const selected = button.dataset.workClass;
        state.workClass = selected;
        $$(".work-class-badge").forEach(item => item.classList.toggle("active", item.dataset.workClass === selected));
        const label = $("#workPortalClassLabel");
        if (label) label.textContent = selected;
        renderWorkPortal();
    }));
    const label = $("#workPortalClassLabel");
    if (label) label.textContent = state.workClass;
    const workClassSelect = $("#workFormClassSelect");
    if (workClassSelect) {
        workClassSelect.innerHTML = classes.map(item => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("");
        workClassSelect.value = state.workClass;
    }
    renderWorkDivisionGrid(classes);
}

function renderWorkDivisionGrid(classes) {
    const grid = $("#workDivisionGrid");
    if (!grid) return;
    grid.innerHTML = classes.map(item => `<button type="button" class="work-division-btn ${normalizedClass(state.workClass) === normalizedClass(item) ? "active" : ""}" data-division-class="${escapeHTML(item)}">${escapeHTML(item)}</button>`).join("");
    $$('[data-division-class]').forEach(button => button.addEventListener("click", () => {
        state.workClass = button.dataset.divisionClass;
        renderWorkPortal();
    }));
}

function populateStudentWorkDropdown() {
    const select = $("#workStudentSelect");
    const classSelect = $("#workFormClassSelect");
    if (!select || !classSelect) return;
    const selectedClass = classSelect.value || state.workClass;
    const students = state.students.filter(student => normalizedClass(classValue(student)) === normalizedClass(selectedClass));
    select.innerHTML = students.length
        ? students.map(student => `<option value="${escapeHTML(String(student.id))}">${escapeHTML(student.name || "Student")}</option>`).join("")
        : `<option value="">No students in this class</option>`;
}

function renderWorkPortal() {
    renderWorkClassFilters();
    populateStudentWorkDropdown();
    const list = $("#studentWorkSubmissionList");
    if (!list) return;
    const selectedClass = state.workClass || "6th A";
    const selectedStudents = state.students.filter(student => normalizedClass(classValue(student)) === normalizedClass(selectedClass));
    const studentList = $("#workPortalStudentList");
    const studentCount = $("#workStudentCount");
    const selectedTitle = $("#workSelectedDivisionTitle");
    if (selectedTitle) selectedTitle.textContent = `Students in ${selectedClass}`;
    if (studentCount) studentCount.textContent = `${selectedStudents.length} student${selectedStudents.length === 1 ? "" : "s"}`;
    if (studentList) {
        studentList.innerHTML = selectedStudents.length ? selectedStudents.map(student => `
            <div class="work-student-card">
                <div><strong>${escapeHTML(student.name || "Student")}</strong><p>${escapeHTML(student.email || "No email")} · ${escapeHTML(student.roll || student.student_id || "Student ID unavailable")}</p></div>
                <button type="button" class="secondary-btn" data-select-work-student="${escapeHTML(String(student.id))}">Select</button>
            </div>
        `).join("") : `<div class="empty-state">No students returned from Supabase for ${escapeHTML(selectedClass)}.</div>`;
        $$('[data-select-work-student]').forEach(button => button.addEventListener("click", () => {
            const classSelect = $("#workFormClassSelect");
            const studentSelect = $("#workStudentSelect");
            if (classSelect) classSelect.value = selectedClass;
            populateStudentWorkDropdown();
            if (studentSelect) studentSelect.value = button.dataset.selectWorkStudent;
            $("#studentWorkForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }));
    }
    const submissions = state.studentWork.filter(item => normalizedClass(item.className || item.class_name) === normalizedClass(selectedClass));

    if (!submissions.length) {
        list.innerHTML = `<div class="empty-state">No work submitted in ${selectedClass} yet.</div>`;
        return;
    }

    list.innerHTML = submissions.map(submission => `
        <div class="submission-card" data-submission-id="${escapeHTML(String(submission.id))}">
            <div class="submission-head">
                <strong>${escapeHTML(submission.title || "Assignment")}</strong>
                <span class="submission-status ${submission.grade ? "graded" : ""}">${submission.grade ? "Graded" : "Pending"}</span>
            </div>
            <p><strong>Student:</strong> ${escapeHTML(submission.studentName || "Student")}</p>
            <p><strong>Type:</strong> ${escapeHTML(submission.workType || "Task")}</p>
            <p>${escapeHTML(submission.description || "No details provided.")}</p>
            <div class="grade-controls">
                <select data-grade-select="${escapeHTML(String(submission.id))}">
                    <option value="A" ${submission.grade === "A" ? "selected" : ""}>A</option>
                    <option value="B" ${submission.grade === "B" ? "selected" : ""}>B</option>
                    <option value="C" ${submission.grade === "C" ? "selected" : ""}>C</option>
                    <option value="D" ${submission.grade === "D" ? "selected" : ""}>D</option>
                    <option value="E" ${submission.grade === "E" ? "selected" : ""}>E</option>
                </select>
                <input type="number" min="0" max="50" step="1" value="${Number(submission.reward || 0)}" data-reward-input="${escapeHTML(String(submission.id))}" aria-label="Reward points">
                <button class="primary-btn sm" data-grade-work="${escapeHTML(String(submission.id))}">Save Grade</button>
            </div>
        </div>
    `).join("");

    $$("[data-grade-work]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.gradeWork;
        const grade = $(`[data-grade-select="${CSS.escape(id)}"]`)?.value || "B";
        const reward = Number($(`[data-reward-input="${CSS.escape(id)}"]`)?.value || 0);
        applyStudentWorkGrade(id, grade, reward);
    }));
}

async function applyStudentWorkGrade(id, grade, reward) {
    const item = state.studentWork.find(record => String(record.id) === String(id));
    if (!item) return;
    item.grade = grade;
    item.reward = Number(reward || 0);
    item.status = "Graded";
    if (supabaseClient) {
        const { error } = await supabaseClient.from("student_work_submissions").update({ grade, reward_points: item.reward, status: item.status }).eq("id", id);
        if (error) {
            showToast(`Grade could not be saved to Supabase: ${error.message}`);
            return;
        }
    } else {
        writeLocal("studentWork", state.studentWork);
    }
    showToast(`${item.studentName || "Student"} graded ${grade} and awarded ${reward} RL points.`);
    renderWorkPortal();
}

async function submitStudentWork(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentId = String(data.get("studentId") || "");
    const selectedClass = String(data.get("className") || state.workClass || "6th A");
    const student = state.students.find(item => String(item.id) === String(studentId));

    if (!studentId || !selectedClass) {
        showToast("Select a student and class before submitting work.");
        return;
    }

    const file = $("#studentWorkAttachment")?.files?.[0];
    const record = {
        id: `work-${Date.now()}`,
        className: selectedClass,
        studentId,
        studentName: student?.name || "Student",
        title: String(data.get("title") || "Submitted work").trim(),
        workType: String(data.get("workType") || "Homework").trim(),
        description: String(data.get("description") || "").trim(),
        attachment: file ? file.name : "No file attached",
        grade: "",
        reward: 0,
        status: "Pending",
        createdAt: new Date().toISOString()
    };

    if (supabaseClient) {
        try {
            let attachmentPath = null;
            if (file) {
                attachmentPath = `${state.teacher?.id || "teacher"}/${Date.now()}-${file.name}`;
                const upload = await supabaseClient.storage.from("student-work").upload(attachmentPath, file);
                if (upload.error) {
                    showToast(`File upload failed: ${upload.error.message}`);
                    return;
                }
            }
            const { data: saved, error } = await supabaseClient.from("student_work_submissions").insert({
                class_name: selectedClass,
                student_id: studentId,
                student_name: record.studentName,
                title: record.title,
                work_type: record.workType,
                description: record.description,
                attachment_name: record.attachment,
                attachment_path: attachmentPath,
                grade: record.grade,
                reward_points: record.reward,
                status: record.status,
                teacher_id: state.teacher?.id || null,
                created_at: record.createdAt
            }).select().single();
            if (error) {
                showToast(`Student work could not be saved: ${error.message}`);
                return;
            }
            record.id = saved.id;
        } catch (error) {
            showToast(`Student work storage unavailable: ${error.message}`);
            return;
        }
    } else {
        writeLocal("studentWork", [record, ...readLocal("studentWork")]);
    }

    state.studentWork.unshift(record);
    state.workClass = selectedClass;
    form.reset();
    $("#studentWorkAttachment").value = "";
    renderWorkPortal();
    showToast("Student work uploaded for grading.");
}

async function signInTeacher(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const teacher = {
        name: String(data.get("teacherName")).trim(),
        schoolId: String(data.get("schoolId")).trim(),
        email: String(data.get("email")).trim(),
        role: data.get("role"),
        className: String(data.get("className")).trim(),
        subject: String(data.get("subject")).trim()
    };

    if (supabaseClient) {
        if (!teacher.email) {
            showToast("Enter your school email for Supabase login.");
            return;
        }
        const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email: teacher.email, password: data.get("password") });
        if (error) {
            showToast(`Login failed: ${error.message}`);
            return;
        }
        teacher.id = authData.user.id;
        const { data: profile } = await supabaseClient
            .from("User")
            .select("id,name,email,role,schoolId,classId")
            .eq("id", teacher.id)
            .maybeSingle();

        if (profile) {
            teacher.name = profile.name;
            teacher.schoolId = profile.schoolId;
            teacher.role = String(profile.role || teacher.role).replace("TEACHER", "Class Teacher");
            teacher.classId = profile.classId;
        }
    } else {
        state.localMode = true;
        localStorage.setItem("eduadapt_teacher_password_present", "true");
    }

    state.teacher = teacher;
    localStorage.setItem("eduadapt_teacher", JSON.stringify(teacher));
    await enterPortal();
}

async function loadTeacherProfile() {
    const { data } = await supabaseClient
        .from("User")
        .select("id,name,email,role,schoolId,classId")
        .eq("email", state.teacher.email)
        .maybeSingle();
    if (data) {
        state.teacher = {
            ...state.teacher,
            name: data.name,
            schoolId: data.schoolId,
            role: String(data.role || "TEACHER").replace("TEACHER", "Class Teacher"),
            classId: data.classId,
            className: "All Classes"
        };

        if (data.classId) {
            const { data: schoolClass } = await supabaseClient
                .from("SchoolClass")
                .select("grade,section")
                .eq("id", data.classId)
                .maybeSingle();

            if (schoolClass) {
                state.teacher.className = `${schoolClass.grade}${schoolClass.section ? ` ${schoolClass.section}` : ""}`;
            }
        }
    }
}

async function enterPortal() {
    state.selectedClass = state.teacher?.className || "All Classes";
    $("#loginView")?.classList.add("hidden");
    $("#appView")?.classList.remove("hidden");
    showPage("dashboard");
    updateTeacherUI();

    try {
        await loadPortalData();
        renderAll();
    } catch (error) {
        console.error("Dashboard data loading failed:", error);
        renderAll();
        showToast("Dashboard opened, but some Supabase data could not be loaded.");
        return;
    }

    showToast(state.localMode ? "Local mode: add Supabase keys for shared school data." : "Dashboard connected.");
}

async function loadPortalData() {
    if (!supabaseClient) {
        state.students = readLocal("students");
        state.classes = readLocal("classes");
        state.quizzes = readLocal("quizzes");
        state.progress = readLocal("progress");
        state.files = readLocal("files");
        state.events = readLocal("events");
        state.tickets = readLocal("tickets");
        state.attendance = readLocal("attendance");
        state.studentWork = readLocal("studentWork");
        return;
    }

    const queries = await Promise.all([
        supabaseClient.from("User").select("id,name,email,role,schoolId,classId").eq("role", "STUDENT"),
        supabaseClient.from("SchoolClass").select("id,schoolId,grade,section,classTeacherId"),
        supabaseClient.from("Game").select("id,title,description,difficulty,gameType,topicId,status,createdAt"),
        supabaseClient.from("game_spec").select("id,slug,title,subject,topic,grade,difficulty,spec,status,created_at"),
        supabaseClient.from("StudentProgress").select("id,studentId,lessonId,masteryScore,attempts,lastUpdated"),
        supabaseClient.from("GameSession").select("id,studentId,gameId,score,accuracy,xpEarned,playedAt,completion"),
        supabaseClient.from("game_play_session").select("id,game_slug,student_id,score,accuracy,completion,created_at"),
        supabaseClient.from("calendar_events").select("*"),
        supabaseClient.from("admin_tickets").select("*").order("created_at", { ascending: false }),
        supabaseClient.from("student_assignments").select("*").order("created_at", { ascending: false }),
        supabaseClient.from("student_notifications").select("*").order("created_at", { ascending: false }),
        supabaseClient.from("student_queries").select("*").order("created_at", { ascending: false }),
        supabaseClient.from("student_work_submissions").select("*").order("created_at", { ascending: false })
    ]);
    state.classes = queries[1].data || [];
    const classMap = new Map(
        state.classes.map(item => [
            String(item.id),
            `${item.grade}${item.section ? ` ${item.section}` : ""}`
        ])
    );
    state.students = (queries[0].data || []).map(student => ({
        ...student,
        class_name: classMap.get(String(student.classId)) || student.classId || ""
    }));
    const games = (queries[2].data || []).map(game => ({
        ...game,
        class_name: game.grade || "All Classes"
    }));
    const gameSpecs = (queries[3].data || []).map(game => ({
        ...game,
        class_name: game.grade || "All Classes",
        description: game.spec?.description || game.topic,
        question: game.spec?.question,
        options: game.spec?.options,
        correct: game.spec?.correct
    }));
    state.quizzes = [...games, ...gameSpecs];
    state.progress = [
        ...(queries[4].data || []).map(item => ({ ...item, score: item.masteryScore, created_at: item.lastUpdated })),
        ...(queries[5].data || []).map(item => ({ ...item, xp: item.xpEarned, created_at: item.playedAt })),
        ...(queries[6].data || []).map(item => ({ ...item, studentId: item.student_id, gameId: item.game_slug, xp: item.score, created_at: item.created_at }))
    ];
    state.events = queries[7].data || [];
    state.tickets = queries[8].data || [];
    state.assignments = !queries[9].error ? (queries[9].data || []) : [];
    state.notifications = !queries[10].error ? (queries[10].data || []) : [];
    state.studentQueries = !queries[11].error ? (queries[11].data || []) : [];
    state.studentWork = !queries[12].error ? (queries[12].data || []).map(item => ({
        ...item,
        className: item.class_name,
        studentId: item.student_id,
        studentName: state.students.find(student => String(student.id) === String(item.student_id))?.name || item.student_name || "Student",
        workType: item.work_type,
        attachment: item.attachment_name,
        reward: item.reward_points,
        createdAt: item.created_at
    })) : [];
    if (queries[9].error) console.warn("Assignments table not available:", queries[9].error.message);
    if (queries[10].error) console.warn("Notifications table not available:", queries[10].error.message);
    if (queries[11].error) console.warn("Student queries table not available:", queries[11].error.message);
    if (queries[12].error) console.warn("Student work table not available:", queries[12].error.message);
    const attendanceResult = await supabaseClient.from("Attendance").select("*");
    state.attendance = attendanceResult.error ? [] : attendanceResult.data || [];
    if (attendanceResult.error && !String(attendanceResult.error.message).toLowerCase().includes("does not exist")) console.warn(attendanceResult.error.message);
    queries.forEach(result => { if (result.error) console.warn(result.error.message); });
}

function openAnalysisPage(page) {
    $$(".nav-item").forEach(item => item.classList.remove("active"));
    showPage(page);
    if (page === "report") {
        populateReportClassSelect();
        resetReportOutput("Select a student, then click Analyze & Build Report.");
    }
    if (page === "graphAnalysis") renderClassAnalysis();
}

function progressForStudent(studentId) {
    return state.progress.filter(item => String(item.student_id || item.studentId) === String(studentId));
}

function scoreForProgress(item) {
    const rawScore = Number(item.score ?? item.masteryScore ?? item.accuracy * 100);
    return Number.isFinite(rawScore) ? Math.round(rawScore <= 1 ? rawScore * 100 : rawScore) : null;
}

function populateReportClassSelect() {
    const select = $("#reportClassSelect");
    if (!select) return;
    const classes = getClassOptions();
    const current = state.workClass || state.selectedClass || classes[0];
    select.innerHTML = classes.map(item => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("");
    select.value = classes.includes(current) ? current : classes[0] || "";
    populateReportStudentSelect(select.value);
}

function populateReportStudentSelect(className) {
    const select = $("#reportStudentSelect");
    if (!select) return;
    const students = state.students.filter(student => normalizedClass(classValue(student)) === normalizedClass(className));
    select.innerHTML = students.length
        ? students.map(student => `<option value="${escapeHTML(String(student.id))}">${escapeHTML(student.name || "Student")}</option>`).join("")
        : `<option value="">No Supabase students found in this division</option>`;
}

function resetReportOutput(message) {
    const output = $("#fullStudentReport");
    if (output) {
        output.dataset.reportReady = "false";
        output.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
    }
}

function buildStudentAnalysis(student, className) {
    const records = progressForStudent(student.id);
    const scores = records.map(scoreForProgress).filter(score => score !== null);
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    const attendance = state.attendance.filter(item => String(item.studentId || item.student_id) === String(student.id));
    const attendanceRate = attendance.length ? Math.round(attendance.filter(item => String(item.status).toUpperCase() !== "ABSENT").length / attendance.length * 100) : null;
    const work = state.studentWork.filter(item => String(item.studentId || item.student_id) === String(student.id));
    const assignments = state.assignments.filter(item => String(item.studentId || item.student_id) === String(student.id));
    const recentScores = scores.slice(-5);
    const trend = recentScores.length > 1 ? recentScores[recentScores.length - 1] - recentScores[0] : null;
    const studyGap = average === null ? "No scored progress record is available yet." : average < 50 ? "Foundational concepts and regular practice need attention." : average < 75 ? "Some concepts are developing but consistency is still needed." : "No major study gap is visible in the recorded scores.";
    const learningGap = records.length === 0 ? "Learning gap cannot be measured until the student completes a recorded game or assessment." : trend !== null && trend < 0 ? "Recent recorded performance is lower than the earlier records." : "Continue the current learning path and monitor the next assessment.";
    const recommendation = average === null ? "Ask the student to complete the next assigned game or assessment so the next analysis has evidence." : average < 50 ? "Use easier adaptive games, revise one concept at a time, and complete short daily practice." : average < 75 ? "Review missed concepts, complete the pending work, and attempt a medium-difficulty game." : "Attempt advanced games, explain solutions, and reinforce concepts through project work.";
    return { className, records, scores, average, attendanceRate, work, assignments, trend, studyGap, learningGap, recommendation, status: average === null ? "Awaiting data" : average >= 75 ? "Strong progress" : average >= 50 ? "Developing" : "Needs support" };
}

function renderStudentReportPage() {
    const output = $("#fullStudentReport");
    const classSelect = $("#reportClassSelect");
    const studentSelect = $("#reportStudentSelect");
    if (!output || !classSelect || !studentSelect) return;
    if (!supabaseClient) {
        output.innerHTML = `<div class="empty-state">Supabase connection is required for live student reports. No dummy report was generated.</div>`;
        return;
    }
    const className = classSelect.value;
    const student = state.students.find(item => String(item.id) === String(studentSelect.value));
    if (!student) {
        output.innerHTML = `<div class="empty-state">No student data returned from Supabase for ${escapeHTML(className)}.</div>`;
        return;
    }
    const analysis = buildStudentAnalysis(student, className);
    const { records, average, attendanceRate, work, assignments, studyGap, learningGap, recommendation, status } = analysis;

    output.innerHTML = `
        <h2>${escapeHTML(student.name || "Student")}</h2>
        <p class="report-meta">Analysis complete from Supabase records · Class: ${escapeHTML(className)} · Student ID: ${escapeHTML(student.id)}</p>
        <div class="student-report-summary">
            <div><span>Average performance</span><strong>${average === null ? "N/A" : `${average}%`}</strong></div>
            <div><span>Attendance</span><strong>${attendanceRate === null ? "N/A" : `${attendanceRate}%`}</strong></div>
            <div><span>Progress records</span><strong>${records.length}</strong></div>
        </div>
        <h3>Teacher Report</h3>
        <p><strong>Current status:</strong> ${status}</p>
        <p><strong>Study gap:</strong> ${studyGap}</p>
        <p><strong>Learning gap:</strong> ${learningGap}</p>
        <p><strong>Work and engagement:</strong> ${work.length} submitted work item${work.length === 1 ? "" : "s"}, ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}, and ${records.length} recorded progress item${records.length === 1 ? "" : "s"}.</p>
        <h3>Evidence-Based Teacher Recommendation</h3>
        <p>${recommendation}</p>
        <h3>Next Actions</h3>
        <ul>
            <li>Complete the next assigned activity and review the concepts marked as difficult.</li>
            <li>Teacher should compare the next score with this report before changing the learning level.</li>
            <li>Keep submitting work so the report reflects current performance rather than old records.</li>
        </ul>
    `;
    output.dataset.reportReady = "true";
}

function downloadStudentReportPdf() {
    const output = $("#fullStudentReport");
    const studentSelect = $("#reportStudentSelect");
    const student = state.students.find(item => String(item.id) === String(studentSelect?.value));
    if (!output || output.dataset.reportReady !== "true" || !student) {
        showToast("Analyze a real Supabase student before downloading the PDF.");
        return;
    }
    const pdfApi = window.jspdf;
    if (!pdfApi?.jsPDF) {
        showToast("PDF library could not be loaded. Use Print Report and choose Save as PDF.");
        return;
    }
    const className = $("#reportClassSelect")?.value || "Class";
    const doc = new pdfApi.jsPDF({ unit: "mm", format: "a4" });
    const margin = 16;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;
    doc.setTextColor(0, 107, 89);
    doc.setFontSize(10);
    doc.text("EDUADAPT / LIVE STUDENT ANALYSIS", margin, y);
    y += 9;
    doc.setTextColor(30, 43, 63);
    doc.setFontSize(20);
    doc.text("Student Progress Report", margin, y);
    y += 9;
    doc.setFontSize(11);
    doc.text(`${student.name || "Student"} | ${className}`, margin, y);
    y += 8;
    doc.setDrawColor(210, 220, 230);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(output.innerText.trim(), pageWidth - margin * 2);
    lines.forEach(line => {
        if (y > 278) {
            doc.addPage();
            y = 18;
        }
        doc.text(line, margin, y);
        y += 5.5;
    });
    const safeName = String(student.name || "student").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "student";
    doc.save(`${safeName}-progress-report.pdf`);
    showToast("Student progress report PDF downloaded.");
}

function classPerformance(className) {
    const students = state.students.filter(student => normalizedClass(classValue(student)) === normalizedClass(className));
    const scores = students.flatMap(student => progressForStudent(student.id).map(scoreForProgress)).filter(score => score !== null);
    return { students, scores, average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null };
}

function renderClassAnalysis() {
    const classSelect = $("#analysisClassSelect");
    const summary = $("#analysisSummaryGrid");
    const canvas = $("#classAnalysisChart");
    if (!classSelect || !summary || !canvas) return;
    if (!supabaseClient) {
        summary.innerHTML = `<div class="empty-state">Supabase connection is required for live graph analysis. No dummy values were added.</div>`;
        return;
    }
    const classes = getClassOptions();
    classSelect.innerHTML = classes.map(item => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("");
    classSelect.value = state.workClass && classes.includes(state.workClass) ? state.workClass : classes[0] || "";
    const selected = classPerformance(classSelect.value);
    summary.innerHTML = `
        <div class="analysis-summary-card"><span>Selected division</span><strong>${escapeHTML(classSelect.value || "N/A")}</strong></div>
        <div class="analysis-summary-card"><span>Students with Supabase records</span><strong>${selected.students.length}</strong></div>
        <div class="analysis-summary-card"><span>Scored progress records</span><strong>${selected.scores.length}</strong></div>
        <div class="analysis-summary-card"><span>Average performance</span><strong>${selected.average === null ? "N/A" : `${selected.average}%`}</strong></div>
    `;
    if (!window.Chart) return;
    if (state.analysisChart) state.analysisChart.destroy();
    const averages = classes.map(item => classPerformance(item).average);
    state.analysisChart = new Chart(canvas, {
        type: "bar",
        data: { labels: classes, datasets: [{ label: "Average recorded performance (%)", data: averages, backgroundColor: "#20c69d", borderColor: "#008f73", borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { tooltip: { callbacks: { label: context => context.raw === null ? "No Supabase progress data" : `${context.raw}%` } } } }
    });
}

function renderAll() {
    updateClassSelector();
    renderWorkClassFilters();
    const students = filteredStudents();
    const quizzes = filteredQuizzes();
    $("#activeStudents").textContent = students.length;
    $("#activeGames").textContent = quizzes.length;
    $("#currentClassDisplay").textContent = state.selectedClass;
    const mastery = students.map(student => Number(student.mastery || student.mastery_percentage || 0)).filter(Number.isFinite);
    $("#averageMastery").textContent = `${mastery.length ? Math.round(mastery.reduce((a, b) => a + b, 0) / mastery.length) : 0}%`;
    $("#totalXP").textContent = `${state.progress.reduce((total, item) => total + Number(item.xp || item.reward || item.credits || 0), 0)} RL-XP`;
    renderStudentTable(students);
    renderDashboardHighlights();
    renderDashboardQuizzes(quizzes);
    renderGamificationPage();
    renderFiles();
    renderCalendar();
    renderAdminTickets();
    renderAssessments();
    renderAttendance();
    renderWorkPortal();
    populateReportClassSelect();
    renderStudentReportPage();
    renderClassAnalysis();
    renderXPChart();
}

function filteredStudents() {
    if (state.selectedClass === "All Classes") return state.students;
    return state.students.filter(student => classValue(student).toLowerCase() === state.selectedClass.toLowerCase());
}

function filteredQuizzes() {
    if (state.selectedClass === "All Classes") return state.quizzes;
    return state.quizzes.filter(quiz => String(quiz.class_name || quiz.className || "").toLowerCase() === state.selectedClass.toLowerCase());
}

function classValue(record) {
    return String(record.class_name || record.className || record.class_section || record.grade || record.classId || "");
}

function normalizedClass(value) {
    return formatClassName(value).replace(/\s+/g, "").toLowerCase();
}

function updateClassSelector() {
    const selector = $("#classSelector");
    if (!selector) return;
    const names = getClassOptions();
    selector.innerHTML = `<option value="All Classes">All Classes</option>${names.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")}`;
    selector.value = names.includes(state.selectedClass) ? state.selectedClass : "All Classes";
}

function renderStudentTable(students) {
    const tbody = $("#studentTableBody");
    if (!tbody) return;
    if (!students.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No student records returned from Supabase for this class.</td></tr>`;
        return;
    }
    tbody.innerHTML = students.map(student => {
        const mastery = Number(student.mastery || student.mastery_percentage || 0);
        const id = student.id || student.student_id || "";
        return `<tr>
            <td><strong>${escapeHTML(student.name || student.full_name || "Student")}</strong></td>
            <td>${escapeHTML(student.roll || student.roll_number || student.student_id || "")}</td>
            <td><span class="badge-active">${escapeHTML(classValue(student))}</span></td>
            <td><strong>${mastery}%</strong></td>
            <td>${mastery < 50 ? "Needs support" : mastery >= 75 ? "Advanced" : "Developing"}</td>
            <td>
                <div class="table-actions">
                    <button class="secondary-btn sm" data-student-profile="${escapeHTML(String(id))}">Profile</button>
                    <button class="primary-btn sm" data-student-assign="${escapeHTML(String(id))}">Assign</button>
                </div>
            </td>
        </tr>`;
    }).join("");
    $$('[data-student-profile]').forEach(button => button.addEventListener("click", () => openStudentProfile(button.dataset.studentProfile)));
    $$('[data-student-assign]').forEach(button => button.addEventListener("click", () => openAssignmentModal(button.dataset.studentAssign)));
}

function renderDashboardHighlights() {
    const student = filteredStudents()[0] || null;
    const selectedBox = $("#selectedStudentInfo");
    const assignmentBox = $("#dashboardAssignmentsList");
    const notificationBox = $("#dashboardNotificationsList");
    const reportBtn = $("#dashboardStudentReportBtn");
    const assignBtn = $("#dashboardAssignBtn");

    if (reportBtn && student) {
        reportBtn.onclick = () => openStudentProfile(student.id || student.student_id);
    }

    if (assignBtn && student) {
        assignBtn.onclick = () => openAssignmentModal(student.id || student.student_id);
    }

    if (selectedBox) {
        if (!student) {
            selectedBox.innerHTML = "No student records available in this class.";
            return;
        }
        const studentId = student.id || student.student_id || "N/A";
        const mastery = Number(student.mastery || student.mastery_percentage || 0);
        selectedBox.innerHTML = `
            <strong>${escapeHTML(student.name || "Student")}</strong>
            <div class="mini-row"><span>ID</span><b>${escapeHTML(studentId)}</b></div>
            <div class="mini-row"><span>Class</span><b>${escapeHTML(classValue(student))}</b></div>
            <div class="mini-row"><span>Mastery</span><b>${mastery}%</b></div>
            <div class="mini-row"><span>Status</span><b>${mastery < 50 ? "Needs support" : mastery >= 75 ? "Advanced" : "Developing"}</b></div>
        `;
    }

    if (assignmentBox) {
        const items = state.assignments.slice(0, 3);
        assignmentBox.innerHTML = items.length ? items.map(item => `
            <div class="mini-item">
                <strong>${escapeHTML(item.title || "Assignment")}</strong>
                <span>${escapeHTML(item.assignment_type || item.type || "Task")}</span>
            </div>
        `).join("") : "No assignments created yet.";
    }

    if (notificationBox) {
        const items = state.notifications.slice(0, 3);
        notificationBox.innerHTML = items.length ? items.map(item => `
            <div class="mini-item">
                <strong>${escapeHTML(item.title || "Notification")}</strong>
                <span>${escapeHTML(item.message || item.body || "New notification")}</span>
            </div>
        `).join("") : "No student notifications yet.";
    }
}

function renderDashboardQuizzes(quizzes) {
    const container = $("#dashboardQuizList");
    if (!container) return;
    container.innerHTML = quizzes.length ? quizzes.slice(0, 5).map(quizCard).join("") : `<div class="empty-state">No games created for this class section yet.</div>`;
    bindPlayButtons(container);
}

function renderGamificationPage() {
    const grid = $("#gamificationGamesGrid");
    if (!grid) return;
    grid.innerHTML = state.quizzes.length ? state.quizzes.map(quizCard).join("") : `<div class="empty-state">No games in Supabase yet. Build the first game for a class section.</div>`;
    bindPlayButtons(grid);
    const mastery = filteredStudents().map(student => Number(student.mastery || 0)).filter(Number.isFinite);
    $("#qState0").textContent = `Action: Easy game · ${mastery.filter(value => value < 50).length} students`;
    $("#qState1").textContent = `Action: Medium game · ${mastery.filter(value => value >= 50 && value < 75).length} students`;
    $("#qState2").textContent = `Action: Hard game · ${mastery.filter(value => value >= 75).length} students`;
}

function renderAssessments() {
    const body = $("#assessmentTableBody");
    if (!body) return;
    const quizzes = filteredQuizzes();
    if (!quizzes.length) {
        body.innerHTML = `<tr><td colspan="7" class="empty-state">No assessment records returned from Supabase.</td></tr>`;
        return;
    }
    body.innerHTML = quizzes.map(quiz => {
        const sessions = state.progress.filter(item => String(item.gameId || item.game_id) === String(quiz.id));
        const average = sessions.length ? Math.round(sessions.reduce((sum, item) => sum + Number(item.score || 0), 0) / sessions.length) : 0;
        return `<tr>
            <td><strong>${escapeHTML(quiz.title || "Untitled assessment")}</strong></td>
            <td>${escapeHTML(quiz.subject || "STEM")}</td>
            <td>${escapeHTML(quiz.class_name || "All Classes")}</td>
            <td>${sessions.length}</td>
            <td>${sessions.length ? `${average}%` : "No submissions"}</td>
            <td><span class="badge-active">${escapeHTML(quiz.status || "READY")}</span></td>
            <td><button class="secondary-btn sm" data-assessment-play="${escapeHTML(String(quiz.id))}">Open</button></td>
        </tr>`;
    }).join("");
    $$('[data-assessment-play]').forEach(button => button.addEventListener("click", () => playQuiz(button.dataset.assessmentPlay)));
}

function renderAttendance() {
    const body = $("#attendanceTableBody");
    if (!body) return;
    const students = filteredStudents();
    if (!students.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-state">No student records returned from Supabase.</td></tr>`;
        updateAttendanceCounts();
        return;
    }
    body.innerHTML = students.map(student => {
        const studentId = student.id || "";
        const record = state.attendance.find(item => String(item.studentId || item.student_id) === String(studentId));
        const present = record ? record.status !== "ABSENT" : true;
        return `<tr>
            <td><strong>${escapeHTML(student.name || "Student")}</strong></td>
            <td>${escapeHTML(studentId)}</td>
            <td>${escapeHTML(classValue(student))}</td>
            <td>${record?.streak || 0} days</td>
            <td><button class="attendance-toggle ${present ? "is-present" : "is-absent"}" data-attendance-student="${escapeHTML(String(studentId))}" data-present="${present}">${present ? "Present" : "Absent"}</button></td>
        </tr>`;
    }).join("");
    $$('[data-attendance-student]').forEach(button => button.addEventListener("click", () => {
        const present = button.dataset.present !== "true";
        button.dataset.present = String(present);
        button.textContent = present ? "Present" : "Absent";
        button.classList.toggle("is-present", present);
        button.classList.toggle("is-absent", !present);
        updateAttendanceCounts();
    }));
    updateAttendanceCounts();
}

function updateAttendanceCounts() {
    const buttons = $$('[data-attendance-student]');
    const present = Array.from(buttons).filter(button => button.dataset.present === "true").length;
    if ($("#presentCount")) $("#presentCount").textContent = present;
    if ($("#absentCount")) $("#absentCount").textContent = buttons.length - present;
}

async function saveAttendance() {
    const buttons = Array.from($$('[data-attendance-student]'));
    if (!buttons.length) return showToast("No students available for this class.");
    const attendanceTableNotice = $("#attendanceSchemaNotice");
    if (!supabaseClient) {
        const records = buttons.map(button => ({ studentId: button.dataset.attendanceStudent, status: button.dataset.present === "true" ? "PRESENT" : "ABSENT", date: new Date().toISOString().slice(0, 10) }));
        writeLocal("attendance", records);
        state.attendance = records;
        showToast("Attendance saved locally. Connect Supabase to share it with the school.");
        return;
    }
    const records = buttons.map(button => ({ studentId: button.dataset.attendanceStudent, teacherId: state.teacher?.id, status: button.dataset.present === "true" ? "PRESENT" : "ABSENT", date: new Date().toISOString().slice(0, 10) }));
    const result = await supabaseClient.from("Attendance").upsert(records, { onConflict: "studentId,date" });
    if (result.error) {
        attendanceTableNotice.classList.remove("hidden");
        attendanceTableNotice.textContent = "Attendance UI is ready, but your schema has no public.\"Attendance\" table yet. Add that table to persist this register.";
        showToast("Attendance table is not available in Supabase.");
        return;
    }
    await loadPortalData();
    renderAttendance();
    showToast("Attendance register saved.");
}

function quizCard(quiz) {
    return `<div class="quiz-card">
        <span class="quiz-meta">${escapeHTML(quiz.subject || "STEM")} · ${escapeHTML(quiz.class_name || quiz.className || "All Classes")} · ${escapeHTML(quiz.difficulty || "Adaptive")}</span>
        <h4>${escapeHTML(quiz.title || "Untitled game")}</h4>
        <p>${escapeHTML(quiz.description || quiz.question || "Teacher-created learning game")}</p>
        <button class="primary-btn sm" data-play-quiz="${escapeHTML(String(quiz.id))}">Play game</button>
    </div>`;
}

function bindPlayButtons(container) {
    container.querySelectorAll("[data-play-quiz]").forEach(button => button.addEventListener("click", () => playQuiz(button.dataset.playQuiz)));
}

function openQuizModal() {
    const form = $("#quizForm");
    if (form) {
        form.elements.className.value = state.selectedClass === "All Classes" ? state.teacher?.className || "" : state.selectedClass;
        form.elements.subject.value = state.teacher?.subject || "";
    }
    openModal("quizModal");
}

async function saveQuiz(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = {
        title: String(data.get("title")).trim(),
        class_name: String(data.get("className")).trim(),
        subject: String(data.get("subject")).trim(),
        difficulty: data.get("difficulty"),
        question: String(data.get("question")).trim(),
        options: { A: data.get("optA"), B: data.get("optB"), C: data.get("optC"), D: data.get("optD") },
        correct: data.get("correct"),
        teacher_id: state.teacher?.id || null
    };
    let saved;
    if (supabaseClient) {
        const gameSpec = {
            slug: `teacher-${state.teacher.id}-${Date.now()}`,
            title: record.title,
            subject: record.subject,
            topic: record.class_name,
            grade: record.class_name,
            difficulty: record.difficulty === "Easy" ? "EASY" : record.difficulty === "Hard" ? "HARD" : "MEDIUM",
            spec: {
                question: record.question,
                options: record.options,
                correct: record.correct,
                teacherId: state.teacher.id
            },
            status: "READY"
        };
        const result = await supabaseClient.from("game_spec").insert(gameSpec).select().single();
        if (result.error) {
            showToast(`Game could not be saved: ${result.error.message}`);
            return;
        }
        saved = result.data;
    } else {
        saved = await saveRecord("games", record, "quizzes");
    }
    if (!saved) return;
    closeModal("quizModal");
    event.currentTarget.reset();
    await loadPortalData();
    renderAll();
    showToast("Game saved for the selected class.");
}

function openStudentModal() {
    const form = $("#studentForm");
    if (form) form.elements.className.value = state.selectedClass === "All Classes" ? state.teacher?.className || "" : state.selectedClass;
    openModal("studentModal");
}

async function saveStudent(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const record = {
        name: String(data.get("name")).trim(),
        roll: String(data.get("roll")).trim(),
        class_name: String(data.get("className")).trim(),
        mastery: Number(data.get("mastery"))
    };
    const saved = await saveRecord("students", record, "students");
    if (!saved) return;
    closeModal("studentModal");
    event.currentTarget.reset();
    await loadPortalData();
    renderAll();
    showToast("Student saved.");
}

async function saveRecord(table, record, localName) {
    if (supabaseClient) {
        const { data, error } = await supabaseClient.from(table).insert(record).select().single();
        if (error) {
            showToast(`Could not save: ${error.message}`);
            return false;
        }
        return data;
    }
    const records = readLocal(localName);
    records.unshift({ ...record, id: `local-${Date.now()}` });
    writeLocal(localName, records);
    return record;
}

async function playQuiz(id) {
    const quiz = state.quizzes.find(item => String(item.id) === String(id));
    if (!quiz) return;
    $("#playQuizTitle").textContent = quiz.title || "Learning game";
    $("#playQuizQuestion").textContent = quiz.question || "No question text was stored.";
    const studentSelect = $("#playStudentSelect");
    const students = filteredStudents();
    studentSelect.innerHTML = students.length
        ? students.map(student => `<option value="${escapeHTML(String(student.id))}">${escapeHTML(student.name || student.full_name || "Student")}</option>`).join("")
        : `<option value="">No students in selected class</option>`;
    studentSelect.disabled = !students.length;
    const options = quiz.options || {};
    $("#playQuizOptions").innerHTML = Object.entries(options).map(([key, value]) => `<button class="secondary-btn" data-answer="${key}"><strong>${key}.</strong> ${escapeHTML(value || "")}</button>`).join("");
    $("#rlRewardFeedback").classList.add("hidden");
    openModal("playModal");
    $$("[data-answer]").forEach(button => button.addEventListener("click", () => submitAnswer(quiz, button.dataset.answer)));
}

async function submitAnswer(quiz, answer) {
    const correct = answer === quiz.correct;
    const reward = correct ? 10 : 2;
    const studentId = $("#playStudentSelect").value;
    const feedback = $("#rlRewardFeedback");
    feedback.classList.remove("hidden");
    feedback.textContent = correct ? `Correct. Student reward: ${reward} RL-XP.` : `Game completed. Participation reward: ${reward} RL-XP.`;
    const progress = { game_id: quiz.id, teacher_id: state.teacher?.id || null, score: correct ? 100 : 50, reward, credits: reward, created_at: new Date().toISOString() };
    if (!studentId) {
        feedback.textContent = "Select a student before recording this game attempt.";
        return;
    }

    if (supabaseClient && quiz.lessonId) {
        await supabaseClient.from("GameSession").insert({
            id: crypto.randomUUID(),
            studentId,
            lessonId: quiz.lessonId,
            gameId: quiz.id,
            score: progress.score,
            accuracy: progress.score / 100,
            timeSpentSec: 0,
            difficultyLevel: quiz.difficulty === "Hard" ? 3 : quiz.difficulty === "Medium" ? 2 : 1,
            xpEarned: reward,
            completion: 1,
            status: "COMPLETED"
        });
    } else if (supabaseClient) {
        const sessionResult = await supabaseClient.from("game_play_session").insert({
            game_slug: quiz.slug || String(quiz.id),
            player_key: studentId,
            student_id: studentId,
            difficulty: String(quiz.difficulty || "EASY").toUpperCase(),
            score: progress.score,
            accuracy: progress.score / 100,
            attempts: 1,
            completion: true,
            concepts_mastered: correct ? [quiz.subject || quiz.topic || "STEM"] : [],
            concepts_misunderstood: correct ? [] : [quiz.subject || quiz.topic || "STEM"]
        });
        if (sessionResult.error) {
            feedback.textContent = `Game result could not be recorded: ${sessionResult.error.message}`;
            return;
        }
    } else if (!supabaseClient) {
        progress.student_id = studentId;
        state.progress.unshift(progress);
        writeLocal("progress", state.progress);
    }
    await loadPortalData();
    renderAll();
}

function initializeFileUpload() {
    const dropzone = $("#dropzone");
    const input = $("#fileInput");
    if (!dropzone || !input) return;
    dropzone.addEventListener("click", () => input.click());
    dropzone.addEventListener("dragover", event => event.preventDefault());
    dropzone.addEventListener("drop", event => { event.preventDefault(); uploadFiles(event.dataTransfer.files); });
    input.addEventListener("change", event => uploadFiles(event.target.files));
}

async function uploadFiles(fileList) {
    for (const file of Array.from(fileList)) {
        if (supabaseClient) {
            const path = `${state.teacher.id}/${Date.now()}-${file.name}`;
            const upload = await supabaseClient.storage.from("classroom-files").upload(path, file);
            if (upload.error) { showToast(`Upload failed: ${upload.error.message}`); continue; }
            await supabaseClient.from("classroom_files").insert({ teacher_id: state.teacher.id, name: file.name, path, size: file.size, class_name: state.selectedClass });
        } else {
            const files = readLocal("files");
            files.unshift({ name: file.name, size: file.size, class_name: state.selectedClass, created_at: new Date().toISOString() });
            writeLocal("files", files);
        }
    }
    await loadPortalData();
    renderFiles();
    showToast("Classroom files updated.");
}

function renderFiles() {
    const container = $("#fileListContainer");
    if (!container) return;
    container.innerHTML = state.files.length ? state.files.map(file => `<div class="file-card"><i data-lucide="file-text"></i><span>${escapeHTML(file.name)}</span><small>${Math.round(Number(file.size || 0) / 1024)} KB</small></div>`).join("") : `<div class="empty-state">No files returned from Supabase.</div>`;
    if (window.lucide) lucide.createIcons();
}

function initializeCalendar() {
    $("#prevMonthBtn")?.addEventListener("click", () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
    $("#nextMonthBtn")?.addEventListener("click", () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });
    $("#addEventBtn")?.addEventListener("click", addCalendarEvent);
}

async function addCalendarEvent() {
    const title = prompt("Event title");
    if (!title) return;
    const date = prompt("Date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!date) return;
    const record = { title, event_date: date, teacher_id: state.teacher?.id || null, class_name: state.selectedClass };
    await saveRecord("calendar_events", record, "events");
    await loadPortalData();
    renderCalendar();
}

function renderCalendar() {
    const grid = $("#calendarGrid");
    const heading = $("#calendarMonthYear");
    if (!grid || !heading) return;
    const date = state.calendarDate;
    heading.textContent = date.toLocaleString("default", { month: "long", year: "numeric" });
    grid.innerHTML = "";
    const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    for (let index = 0; index < first; index += 1) grid.appendChild(document.createElement("div"));
    for (let day = 1; day <= total; day += 1) {
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const events = state.events.filter(event => String(event.event_date || event.date || "").startsWith(iso));
        cell.innerHTML = `<strong>${day}</strong>${events.map(event => `<small>${escapeHTML(event.title)}</small>`).join("")}`;
        grid.appendChild(cell);
    }
}

function initializeAdminTickets() {
    $("#quickAdminBtn")?.addEventListener("click", () => showPage("admin"));
    $("#adminQueryForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const record = { type: data.get("type"), subject: data.get("subject"), message: data.get("message"), teacher_id: state.teacher?.id || null, status: "Pending" };
        await saveRecord("admin_tickets", record, "tickets");
        event.currentTarget.reset();
        await loadPortalData();
        renderAdminTickets();
        showToast("Admin request sent.");
    });
}

function renderAdminTickets() {
    const container = $("#adminMessageList");
    if (!container) return;
    container.innerHTML = state.tickets.length ? state.tickets.map(ticket => `<article class="ticket-card"><header><strong>${escapeHTML(ticket.type)}</strong><span>${escapeHTML(ticket.status || "Pending")}</span></header><h4>${escapeHTML(ticket.subject)}</h4><p>${escapeHTML(ticket.message)}</p></article>`).join("") : `<div class="empty-state">No admin messages returned from Supabase.</div>`;
}

function openStudentProfile(studentId) {
    const student = state.students.find(item => String(item.id) === String(studentId));
    if (!student) return;

    const records = state.progress.filter(item => String(item.student_id || item.studentId) === String(studentId));
    const assignments = state.assignments.filter(item => String(item.student_id || item.studentId) === String(studentId));
    const notifications = state.notifications.filter(item => String(item.student_id || item.studentId) === String(studentId));
    const queries = state.studentQueries.filter(item => String(item.student_id || item.studentId) === String(studentId));
    const attendance = state.attendance.filter(item => String(item.studentId || item.student_id) === String(studentId));
    const average = records.length ? Math.round(records.reduce((sum, item) => sum + Number(item.score || item.masteryScore || 0), 0) / records.length) : Number(student.mastery || 0);
    const attendanceRate = attendance.length ? Math.round((attendance.filter(item => String(item.status).toUpperCase() !== "ABSENT").length / attendance.length) * 100) : 0;

    const modal = document.createElement("div");
    modal.className = "modal open";
    modal.innerHTML = `
        <div class="modal-content student-profile-modal">
            <button class="modal-close" data-close="studentProfileModal"><i data-lucide="x"></i></button>
            <div class="student-hero">
                <div class="profile-avatar large">${escapeHTML((student.name || "Student").split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase() || "ST")}</div>
                <div>
                    <span class="student-profile-tag">Student Profile</span>
                    <h2>${escapeHTML(student.name || "Student")}</h2>
                    <p>${escapeHTML(student.email || "No email available")} · ${escapeHTML(classValue(student))}</p>
                </div>
            </div>

            <div class="student-actions-row">
                <button class="primary-btn" data-generate-report="${escapeHTML(String(studentId))}">Generate / View Report</button>
                <button class="secondary-btn" data-assign-profile="${escapeHTML(String(studentId))}">Assign Work</button>
                <button class="secondary-btn" data-message-student="${escapeHTML(String(studentId))}">Message Student</button>
            </div>

            <div class="student-analysis-grid">
                <div class="student-stat-box"><span>Overall Mastery</span><strong>${average}%</strong></div>
                <div class="student-stat-box"><span>Progress Records</span><strong>${records.length}</strong></div>
                <div class="student-stat-box"><span>Attendance</span><strong>${attendanceRate}%</strong></div>
                <div class="student-stat-box"><span>Assignments</span><strong>${assignments.length}</strong></div>
            </div>

            <div class="student-report-box" id="studentReportBox">
                <h3>Student Progress Report</h3>
                <p>Teacher can view the student’s latest performance, assignment status, attendance overview, and communication summary here.</p>
            </div>

            <div class="student-section-grid">
                <div class="student-panel">
                    <h3>Performance Graph</h3>
                    <div class="chart-container small-chart"><canvas id="studentProgressChart"></canvas></div>
                </div>
                <div class="student-panel">
                    <h3>Latest Progress</h3>
                    <table class="student-table compact-table">
                        <thead><tr><th>Item</th><th>Score</th><th>Attempt</th></tr></thead>
                        <tbody>
                            ${records.length ? records.slice(0, 5).map(item => `<tr><td>${escapeHTML(item.gameId || item.lessonId || "Progress record")}</td><td>${Number(item.score || item.masteryScore || 0)}%</td><td>${Number(item.attempts || 1)}</td></tr>`).join("") : `<tr><td colspan="3" class="empty-state">No progress record yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="student-section-grid">
                <div class="student-panel">
                    <h3>Assignments &amp; Notes</h3>
                    ${assignments.length ? assignments.map(item => `<div class="assignment-item"><strong>${escapeHTML(item.title || "Assignment")}</strong><span>${escapeHTML(item.assignment_type || item.type || "Task")} · ${escapeHTML(item.content || item.topic || "General")}</span><small>${escapeHTML(new Date(item.created_at || item.assigned_at || Date.now()).toLocaleString())}</small></div>`).join("") : `<div class="empty-state">No assignments sent to this student.</div>`}
                </div>

                <div class="student-panel">
                    <h3>Notifications</h3>
                    ${notifications.length ? notifications.map(item => `<div class="notification-item"><strong>${escapeHTML(item.title || "Notification")}</strong><p>${escapeHTML(item.message || item.body || "New message")}</p><small>${escapeHTML(new Date(item.created_at || item.sent_at || Date.now()).toLocaleString())}</small></div>`).join("") : `<div class="empty-state">No notifications for this student.</div>`}
                </div>
            </div>

            <div class="student-panel student-query-panel">
                <h3>Student Query / Interaction</h3>
                ${queries.length ? queries.map(item => `<div class="query-item"><strong>${escapeHTML(item.subject || "Student query")}</strong><p>${escapeHTML(item.message || item.query || "No details")}</p><small>${escapeHTML(new Date(item.created_at || item.sent_at || Date.now()).toLocaleString())}</small></div>`).join("") : `<div class="empty-state">No direct student query logged yet.</div>`}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const closeButton = modal.querySelector(".modal-close");
    if (closeButton) closeButton.addEventListener("click", () => modal.remove());

    const reportButton = modal.querySelector("[data-generate-report]");
    if (reportButton) reportButton.addEventListener("click", () => generateStudentReport(studentId, modal));

    const assignButton = modal.querySelector("[data-assign-profile]");
    if (assignButton) assignButton.addEventListener("click", () => {
        modal.remove();
        openAssignmentModal(studentId);
    });

    const messageButton = modal.querySelector("[data-message-student]");
    if (messageButton) messageButton.addEventListener("click", () => {
        modal.remove();
        openInteractionModal(studentId);
    });

    if (window.Chart) {
        const labels = records.length ? records.slice(-6).map((item, index) => `P${index + 1}`) : ["No data"];
        const values = records.length ? records.slice(-6).map(item => Number(item.score || item.masteryScore || 0)) : [0];
        const canvas = modal.querySelector("#studentProgressChart");
        if (canvas) {
            new Chart(canvas, {
                type: "line",
                data: {
                    labels,
                    datasets: [{ label: "Student mastery", data: values, borderColor: "#00a982", backgroundColor: "rgba(0,169,130,.15)", tension: 0.4, fill: true }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
            });
        }
    }

    if (window.lucide) lucide.createIcons();
    generateStudentReport(studentId, modal);
}

function generateStudentReport(studentId, modal) {
    const student = state.students.find(item => String(item.id) === String(studentId));
    if (!student) return;
    const records = state.progress.filter(item => String(item.student_id || item.studentId) === String(studentId));
    const average = records.length ? Math.round(records.reduce((sum, item) => sum + Number(item.score || item.masteryScore || 0), 0) / records.length) : Number(student.mastery || 0);
    const attendance = state.attendance.filter(item => String(item.studentId || item.student_id) === String(studentId));
    const attendanceRate = attendance.length ? Math.round((attendance.filter(item => String(item.status).toUpperCase() !== "ABSENT").length / attendance.length) * 100) : 0;
    const reportBox = modal?.querySelector("#studentReportBox");
    if (!reportBox) return;
    reportBox.innerHTML = `
        <h3>Student Progress Report</h3>
        <p><strong>Student:</strong> ${escapeHTML(student.name || "Student")} | <strong>Class:</strong> ${escapeHTML(classValue(student))}</p>
        <p><strong>Teacher:</strong> ${escapeHTML(state.teacher?.name || "Teacher")} | <strong>School ID:</strong> ${escapeHTML(student.schoolId || student.school_id || "N/A")}</p>
        <div class="student-report-summary">
            <div><span>Overall mastery</span><strong>${average}%</strong></div>
            <div><span>Attendance</span><strong>${attendanceRate}%</strong></div>
            <div><span>Games / assessments</span><strong>${records.length}</strong></div>
        </div>
        <ul>
            <li>Completed learning tasks: ${records.length || 0}</li>
            <li>Latest performance status: ${average >= 75 ? "High achiever" : average >= 50 ? "Developing well" : "Needs support"}</li>
            <li>Assignments sent: ${state.assignments.filter(item => String(item.student_id || item.studentId) === String(studentId)).length}</li>
        </ul>
    `;
}

function openAssignmentModal(studentId) {
    const form = $("#assignmentForm");
    if (!form) return;
    form.elements.studentId.value = studentId;
    const student = state.students.find(item => String(item.id) === String(studentId));
    if (student) {
        const title = form.elements.title;
        if (title) title.value = `${student.name || "Student"} - New Assignment`;
    }
    openModal("assignmentModal");
}

function openInteractionModal(studentId) {
    const form = $("#studentInteractionForm");
    if (!form) return;
    form.elements.studentId.value = studentId;
    const student = state.students.find(item => String(item.id) === String(studentId));
    if (student) {
        form.elements.subject.value = `Query for ${student.name || "student"}`;
    }
    openModal("studentInteractionModal");
}

async function sendStudentEmail(student, title, message) {
    if (!student || !student.email || !supabaseClient) return false;
    try {
        await supabaseClient.functions.invoke("send-student-email", {
            body: {
                to: student.email,
                name: student.name,
                teacher_name: state.teacher?.name || "Teacher",
                subject: title,
                message
            }
        });
        return true;
    } catch (error) {
        console.warn("Email function not configured:", error);
        return false;
    }
}

async function submitAssignment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const studentId = String(formData.get("studentId") || "");
    const student = state.students.find(item => String(item.id) === String(studentId));

    const record = {
        student_id: studentId,
        studentId,
        teacher_id: state.teacher?.id || null,
        teacher_name: state.teacher?.name || "Teacher",
        title: String(formData.get("title") || "").trim(),
        assignment_type: String(formData.get("type") || "General").trim(),
        type: String(formData.get("type") || "General").trim(),
        content: String(formData.get("content") || "").trim(),
        topic: String(formData.get("content") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
        class_name: state.selectedClass === "All Classes" ? state.teacher?.className || "" : state.selectedClass,
        created_at: new Date().toISOString(),
        assigned_at: new Date().toISOString()
    };

    if (!studentId || !record.title) {
        showToast("Select a student and enter an assignment title.");
        return;
    }

    if (supabaseClient) {
        const { error } = await supabaseClient.from("student_assignments").insert(record).select().single();
        if (error) {
            showToast(`Assignment table not available: ${error.message}. Add it in Supabase first.`);
            return;
        }

        const notification = {
            student_id: studentId,
            studentId,
            teacher_id: state.teacher?.id || null,
            teacher_name: record.teacher_name,
            title: record.title,
            message: `New ${record.assignment_type} assigned by ${record.teacher_name}: ${record.content || record.notes}`,
            body: `New ${record.assignment_type} assigned by ${record.teacher_name}: ${record.content || record.notes}`,
            created_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            status: "UNREAD"
        };

        const notificationResult = await supabaseClient.from("student_notifications").insert(notification);
        if (notificationResult.error) {
            console.warn("Notification table not available or insert failed:", notificationResult.error.message);
        }

        await sendStudentEmail(student, record.title, record.notes || `A new ${record.assignment_type} has been assigned to you. Please check your dashboard and complete it.`);

        await loadPortalData();
        renderAll();
        closeModal("assignmentModal");
        form.reset();
        showToast("Assignment shared and student notified.");
        return;
    }

    state.assignments.unshift(record);
    state.notifications.unshift({
        student_id: studentId,
        title: record.title,
        message: `New ${record.assignment_type} assigned by ${record.teacher_name}: ${record.content || record.notes}`,
        created_at: new Date().toISOString()
    });
    closeModal("assignmentModal");
    form.reset();
    renderAll();
    showToast("Assignment created in local mode.");
}

async function submitStudentQuery(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const studentId = String(formData.get("studentId") || "");
    const student = state.students.find(item => String(item.id) === String(studentId));
    const subject = String(formData.get("subject") || "Student Query").trim();
    const message = String(formData.get("message") || "").trim();

    if (!studentId || !message) {
        showToast("Select a student and write the query message.");
        return;
    }

    const payload = {
        student_id: studentId,
        studentId,
        teacher_id: state.teacher?.id || null,
        teacher_name: state.teacher?.name || "Teacher",
        subject,
        message,
        created_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: "NEW"
    };

    if (supabaseClient) {
        const { error } = await supabaseClient.from("student_queries").insert(payload).select().single();
        if (error) {
            console.warn("Student queries table missing or unavailable:", error.message);
        }
    }

    state.studentQueries.unshift(payload);
    await sendStudentEmail(student, subject, `Teacher message: ${message}`);
    closeModal("studentInteractionModal");
    form.reset();
    renderAll();
    showToast("Student query sent and notification shared.");
}

function initializeChatbot() {
    $("#chatbotForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const input = $("#chatbotInput");
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        addChatMessage(text, "user");
        addChatMessage(`I can report ${state.students.length} students, ${state.quizzes.length} games, and ${state.progress.length} progress records from this portal.`, "bot");
        input.value = "";
    });
    $("#chatbotButton")?.addEventListener("click", () => $("#chatbot")?.classList.add("open"));
    $("#closeChatbot")?.addEventListener("click", () => $("#chatbot")?.classList.remove("open"));
}

function addChatMessage(text, type) {
    const container = $("#chatMessages");
    if (!container) return;
    const message = document.createElement("div");
    message.className = `${type}-message`;
    message.textContent = text;
    container.appendChild(message);
}

function showPage(page) {
    $$(".page").forEach(item => item.classList.remove("active-page"));
    $(`#${page}Page`)?.classList.add("active-page");
    $("#pageTitle").textContent = page.charAt(0).toUpperCase() + page.slice(1);
}

function updateTeacherUI() {
    const teacher = state.teacher;
    const name = teacher?.name || teacher?.email || "Teacher";
    $("#teacherName").textContent = name;
    $("#teacherDetails").textContent = `${teacher?.role || "Teacher"} · ${teacher?.className || "All Classes"}${teacher?.subject ? ` (${teacher.subject})` : ""}`;
    $("#profileAvatar").textContent = name.split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase();
}

function editPreferences() {
    const className = prompt("Enter the class section to manage (example: 7th B)", state.teacher?.className || "");
    if (!className) return;
    state.teacher.className = className.trim();
    localStorage.setItem("eduadapt_teacher", JSON.stringify(state.teacher));
    updateTeacherUI();
    updateClassSelector();
    showToast("Class preference updated.");
}

async function logoutTeacher() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem("eduadapt_teacher");
    localStorage.removeItem("eduadapt_table_session");
    localStorage.removeItem("eduadapt_demo_mode");
    location.reload();
}

function toggleTheme() {
    document.body.classList.toggle("dark");
    localStorage.setItem("eduadapt_dark_mode", document.body.classList.contains("dark"));
    $("#darkModeStatus").textContent = document.body.classList.contains("dark") ? "ON" : "OFF";
    renderXPChart();
}

function applyTheme() {
    const dark = localStorage.getItem("eduadapt_dark_mode") === "true";
    document.body.classList.toggle("dark", dark);
    if ($("#darkModeStatus")) $("#darkModeStatus").textContent = dark ? "ON" : "OFF";
}

function renderXPChart() {
    const canvas = $("#xpChart");
    if (!canvas || !window.Chart) return;
    if (state.chart) state.chart.destroy();
    const records = state.progress.filter(item => state.selectedClass === "All Classes" || item.class_name === state.selectedClass);
    const grouped = {};
    records.forEach(record => {
        const date = String(record.created_at || record.date || "").slice(0, 10);
        if (date) grouped[date] = (grouped[date] || 0) + Number(record.reward || record.xp || record.credits || record.score || 0);
    });
    const labels = Object.keys(grouped).sort();
    const values = labels.map(label => grouped[label]);
    const empty = !labels.length;
    state.chart = new Chart(canvas, { type: "line", data: { labels: empty ? ["No recorded progress"] : labels, datasets: [{ label: "Recorded RL progress", data: empty ? [0] : values, borderColor: "#00a982", backgroundColor: "rgba(0,169,130,.12)", fill: true, tension: .35 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
}

function openModal(id) { $(`#${id}`)?.classList.add("open"); }
function closeModal(id) { $(`#${id}`)?.classList.remove("open"); }
function showToast(message) { const toast = $("#toast"); if (!toast) return; $("#toastMsg").textContent = message; toast.classList.remove("hidden"); setTimeout(() => toast.classList.add("hidden"), 3500); }
function readLocal(name) { try { return JSON.parse(localStorage.getItem(localKey(name)) || "[]"); } catch (error) { return []; } }
function writeLocal(name, value) { localStorage.setItem(localKey(name), JSON.stringify(value)); }
function loadLocalStore() {}
function escapeHTML(value) { return String(value ?? "").replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character])); }
