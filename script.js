document.addEventListener('DOMContentLoaded', async () => {
    // --- Configuración de Supabase ---
    const SUPABASE_URL = 'https://zxycpmxdniqtgmwrtaeo.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_NrC1VDFAIQ8h0I-e9ShwEw_fN7QGs1Y';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- Estado Global ---
    let transactions = [];
    let categories = [];
    let currentTimeScale = 'weekly';
    let cycleType = 'weekly';
    let cycleStartDay = 1; // 0=Dom, 1=Lun
    let cycleStartDate = 1;

    // --- Chart Instances ---
    let flowChart = null;
    let healthChart = null;
    let categoryChart = null;

    // --- Elementos DOM ---
    const transactionForm = document.getElementById('transaction-form');
    const categoryFormInput = document.getElementById('new-category-name');
    const categoryFormType = document.getElementById('new-category-type');
    const addCategoryBtn = document.getElementById('add-category-btn');
    const categorySelect = document.getElementById('category');
    const categoriesListDiv = document.getElementById('categories-list');
    const transactionListDiv = document.getElementById('transaction-list');
    const totalBalanceEl = document.getElementById('total-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');
    const clearDataBtn = document.getElementById('clear-data-btn');
    const currentPeriodLabel = document.getElementById('current-period-label');

    const cycleTypeSelect = document.getElementById('cycle-type');
    const cycleStartDaySelect = document.getElementById('cycle-start-day');
    const cycleStartDateInput = document.getElementById('cycle-start-date');
    const weeklyStartContainer = document.getElementById('weekly-start-container');
    const monthlyStartContainer = document.getElementById('monthly-start-container');

    // --- Lógica de Navegación ---
    window.switchPlane = function(planeId) {
        document.querySelectorAll('.plane').forEach(p => p.classList.remove('active'));
        document.getElementById(planeId).classList.add('active');
    };

    // --- Persistencia ---
    async function syncSettings() {
        const { error } = await supabaseClient
            .from('user_settings')
            .upsert({ id: 1, cycle_type: cycleType, cycle_start_day: cycleStartDay, cycle_start_date: cycleStartDate });
        if (error) console.error('Error syncing settings:', error);
    }

    async function migrateLocalStorage() {
        const localTransactions = JSON.parse(localStorage.getItem('myFinances_transactions'));
        const localCategories = JSON.parse(localStorage.getItem('myFinances_categories'));

        if (localTransactions && localTransactions.length > 0) {
            console.log('Migrating transactions...');
            const formattedTransactions = localTransactions.map(t => ({
                amount: t.amount,
                type: t.type,
                category: t.category,
                description: t.description,
                date: t.date
            }));
            await supabaseClient.from('transactions').insert(formattedTransactions);
            localStorage.removeItem('myFinances_transactions');
        }

        if (localCategories && localCategories.length > 0) {
            console.log('Migrating categories...');
            await supabaseClient.from('categories').insert(localCategories);
            localStorage.removeItem('myFinances_categories');
        }

        const localCycleType = localStorage.getItem('myFinances_cycle_type');
        if (localCycleType) {
            cycleType = localCycleType;
            cycleStartDay = parseInt(localStorage.getItem('myFinances_cycle_start_day')) || 1;
            cycleStartDate = parseInt(localStorage.getItem('myFinances_cycle_start_date')) || 1;
            await syncSettings();
            localStorage.removeItem('myFinances_cycle_type');
            localStorage.removeItem('myFinances_cycle_start_day');
            localStorage.removeItem('myFinances_cycle_start_date');
        }
    }

    async function loadData() {
        // Load Transactions
        const { data: tData, error: tError } = await supabaseClient.from('transactions').select('*').order('date', { ascending: false });
        if (tError) console.error('Error loading transactions:', tError);
        else transactions = tData;

        // Load Categories
        const { data: cData, error: cError } = await supabaseClient.from('categories').select('*');
        if (cError) console.error('Error loading categories:', cError);
        else categories = cData.map(c => ({ name: c.name, type: c.type }));

        // Load Settings
        const { data: sData, error: sError } = await supabaseClient.from('user_settings').select('*').single();
        if (sError) console.error('Error loading settings:', sError);
        else if (sData) {
            cycleType = sData.cycle_type;
            cycleStartDay = sData.cycle_start_day;
            cycleStartDate = sData.cycle_start_date;
        }
    }

    // --- Lógica de Ciclos y Filtrado ---
    function getFilteredTransactions() {
        const now = new Date();
        let start = new Date(now);
        let label = "";

        switch(currentTimeScale) {
            case 'daily':
                start.setHours(0,0,0,0);
                label = "Hoy";
                break;
            case 'weekly':
                // Calcular inicio basándose en el día elegido (cycleStartDay)
                const currentDay = now.getDay();
                const diff = (currentDay < cycleStartDay) ? (7 - (cycleStartDay - currentDay)) : (currentDay - cycleStartDay);
                start.setDate(now.getDate() - diff);
                start.setHours(0,0,0,0);
                label = "Esta Semana";
                break;
            case 'monthly':
                // Calcular inicio basándose en la fecha elegida (cycleStartDate)
                let monthStart = new Date(now.getFullYear(), now.getMonth(), cycleStartDate);
                if (now.getDate() < cycleStartDate) {
                    monthStart = new Date(now.getFullYear(), now.getMonth() - 1, cycleStartDate);
                }
                start = monthStart;
                start.setHours(0,0,0,0);
                label = "Este Mes";
                break;
            case 'yearly':
                start = new Date(now.getFullYear(), 0, 1);
                label = "Este Año";
                break;
        }

        currentPeriodLabel.textContent = label;
        return transactions.filter(t => new Date(t.date) >= start);
    }

    // --- Lógica de Categorías ---
    function renderCategories() {
        categoriesListDiv.innerHTML = '';
        categories.forEach((cat, index) => {
            const tag = document.createElement('div');
            tag.className = 'category-tag';
            tag.innerHTML = `
                <span style="color:${cat.type === 'income' ? 'var(--income)' : 'var(--expense)'}">●</span>
                ${cat.name}
                <span class="remove-cat" data-id="${cat.id || index}">&times;</span>
            `;
            categoriesListDiv.appendChild(tag);
        });
        updateCategoryDropdown();
    }

    function updateCategoryDropdown() {
        const type = document.getElementById('type').value;
        categorySelect.innerHTML = '<option value="" disabled selected>Seleccionar</option>';
        categories.filter(c => c.type === type).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
    }

    async function addCategory() {
        const name = categoryFormInput.value.trim();
        const type = categoryFormType.value;
        if (name && !categories.find(c => c.name === name)) {
            const { data, error } = await supabaseClient
                .from('categories')
                .insert({ name, type })
                .select();
            if (error) {
                console.error('Error adding category:', error);
            } else {
                categories.push(data[0]);
                categoryFormInput.value = '';
                renderCategories();
            }
        }
    }

    // --- Transacciones ---
    function renderTransactions() {
        transactionListDiv.innerHTML = '';
        const filtered = getFilteredTransactions();

        if (filtered.length === 0) {
            transactionListDiv.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px 0;">No hay actividad en este periodo.</p>';
        }

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        filtered.forEach(t => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            const isInc = t.type === 'income';
            item.innerHTML = `
                <div class="transaction-info">
                    <h4>${t.description}</h4>
                    <p>${t.category} • ${t.date}</p>
                </div>
                <div class="transaction-amount">
                    <span class="amount-value ${isInc ? 'amount-income' : 'amount-expense'}">
                        ${isInc ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}
                    </span>
                    <button class="delete-transaction" data-id="${t.id}">&times;</button>
                </div>
            `;
            transactionListDiv.appendChild(item);
        });

        updateSummary();
        updateCharts();
    }

    function updateSummary() {
        const filtered = getFilteredTransactions();
        const income = filtered.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
        const expense = filtered.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);

        totalBalanceEl.textContent = `$${(income - expense).toFixed(2)}`;
        totalIncomeEl.textContent = `$${income.toFixed(2)}`;
        totalExpenseEl.textContent = `$${expense.toFixed(2)}`;
    }

    // --- Gráficos ---
    function updateCharts() {
        const filtered = getFilteredTransactions();
        const income = filtered.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
        const expense = filtered.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);

        if (flowChart) flowChart.destroy();
        flowChart = new Chart(document.getElementById('mainFlowChart'), {
            type: 'bar',
            data: {
                labels: [currentTimeScale.toUpperCase()],
                datasets: [
                    { label: 'Ingresos', data: [income], backgroundColor: '#28CD7D', borderRadius: 10 },
                    { label: 'Gastos', data: [expense], backgroundColor: '#FF453A', borderRadius: 10 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } }
        });

        if (healthChart) healthChart.destroy();
        healthChart = new Chart(document.getElementById('healthChart'), {
            type: 'doughnut',
            data: {
                labels: ['Gastado', 'Restante'],
                datasets: [{
                    data: [expense, Math.max(0, income - expense)],
                    backgroundColor: ['#FF453A', '#E5E5E7'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '80%', plugins: { legend: { display: false } } }
        });

        const catData = {};
        filtered.filter(t => t.type === 'expense').forEach(t => {
            catData[t.category] = (catData[t.category] || 0) + t.amount;
        });
        const sortedCats = Object.entries(catData).sort((a, b) => b[1] - a[1]);

        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(document.getElementById('categoryChart'), {
            type: 'bar',
            data: {
                labels: sortedCats.map(c => c[0]),
                datasets: [{
                    label: 'Consumo',
                    data: sortedCats.map(c => c[1]),
                    backgroundColor: '#0066CC',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }
            }
        });
    }

    // --- Eventos ---
    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('amount').value);
        const type = document.getElementById('type').value;
        const category = document.getElementById('category').value;
        const description = document.getElementById('description').value;
        const date = document.getElementById('date').value;

        const { data, error } = await supabaseClient
            .from('transactions')
            .insert({ amount, type, category, description, date })
            .select();

        if (error) {
            console.error('Error registering transaction:', error);
        } else {
            transactions.unshift(data[0]);
            renderTransactions();
            transactionForm.reset();
            document.getElementById('date').valueAsDate = new Date();
        }
    });

    document.getElementById('type').addEventListener('change', updateCategoryDropdown);
    addCategoryBtn.addEventListener('click', addCategory);

    // Selector de Temporalidad
    document.querySelectorAll('.scale-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTimeScale = e.target.dataset.scale;
            renderTransactions();
        });
    });

    // Configuración de Ciclos
    cycleTypeSelect.addEventListener('change', async (e) => {
        cycleType = e.target.value;
        if (cycleType === 'weekly') {
            weeklyStartContainer.classList.remove('hidden');
            monthlyStartContainer.classList.add('hidden');
        } else {
            weeklyStartContainer.classList.add('hidden');
            monthlyStartContainer.classList.remove('hidden');
        }
        await syncSettings();
        renderTransactions();
    });

    cycleStartDaySelect.addEventListener('change', async (e) => {
        cycleStartDay = parseInt(e.target.value);
        await syncSettings();
        renderTransactions();
    });

    cycleStartDateInput.addEventListener('change', async (e) => {
        cycleStartDate = parseInt(e.target.value);
        await syncSettings();
        renderTransactions();
    });

    categoriesListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-cat')) {
            const id = e.target.dataset.id;
            const { error } = await supabaseClient.from('categories').delete().eq('id', id);
            if (error) {
                console.error('Error deleting category:', error);
            } else {
                categories = categories.filter(c => c.id !== id);
                renderCategories();
            }
        }
    });

    transactionListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-transaction')) {
            const id = e.target.dataset.id;
            const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
            if (error) {
                console.error('Error deleting transaction:', error);
            } else {
                transactions = transactions.filter(t => t.id !== id);
                renderTransactions();
            }
        }
    });

    clearDataBtn.addEventListener('click', async () => {
        if (confirm('¿Limpiar todos los datos en la nube?')) {
            await supabaseClient.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabaseClient.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            transactions = [];
            categories = [];
            renderTransactions();
            renderCategories();
        }
    });

    // Inicialización
    await migrateLocalStorage();
    await loadData();

    cycleTypeSelect.value = cycleType;
    cycleStartDaySelect.value = cycleStartDay;
    cycleStartDateInput.value = cycleStartDate;
    if (cycleType === 'weekly') {
        weeklyStartContainer.classList.remove('hidden');
        monthlyStartContainer.classList.add('hidden');
    } else {
        weeklyStartContainer.classList.add('hidden');
        monthlyStartContainer.classList.remove('hidden');
    }

    document.getElementById('date').valueAsDate = new Date();
    renderCategories();
    renderTransactions();
});
