/*global H5P*/
var H5P = H5P || {};

/**
 * Multiplication Trainer.
 *
 * A timed drill of the multiplication tables. The learner is shown one task at
 * a time ("4 × 5 = [ ]"), types the answer into an input field right after the
 * equals sign and submits it with the Enter key or the submit button. When the
 * configured time is up, a table lists every task with the given answer and
 * whether it was right or wrong.
 */
H5P.MultiplicationTrainer = (function ($) {

  // Default parameters; merged with whatever the content provides so the type
  // keeps working even if a field is missing from an older content.json.
  var DEFAULTS = {
    intro: '<p>Solve as many multiplication tasks as you can before the time runs out!</p>',
    durationSeconds: 60,
    practiceMode: 1,  // 1 = multiplication only, 2 = division only, 3 = both
    minFactor: 1,
    maxFactor: 10,
    l10n: {
      startButton: 'Start',
      submitButton: 'Enter',
      retryButton: 'Try again',
      timeLeftLabel: 'Time left: :time',
      scoreLabel: 'Correct: :count',
      multiplicationSign: '×',
      divisionSign: '÷',
      resultsHeader: "Time's up! Here are your results:",
      summaryText: 'You got :correct out of :total correct.',
      taskColumn: 'Task',
      yourAnswerColumn: 'Your answer',
      resultColumn: 'Result',
      correctText: 'Correct',
      wrongText: 'Wrong (:answer)',
      noTasksText: 'You did not answer any task.',
      blankAnswer: '(blank)'
    }
  };

  /**
   * @param {Object} params Parameters from content.json.
   * @param {number} contentId The H5P content id.
   */
  function MultiplicationTrainer(params, contentId) {
    H5P.EventDispatcher.call(this);

    this.contentId = contentId;
    // Deep-merge so a partial l10n group still gets the missing defaults.
    this.params = $.extend(true, {}, DEFAULTS, params);

    // Guard against a reversed or invalid factor range.
    this.minFactor = Math.min(this.params.minFactor, this.params.maxFactor);
    this.maxFactor = Math.max(this.params.minFactor, this.params.maxFactor);

    this.answered = [];   // {a, b, product, given, correct}
    this.correctCount = 0;
    this.current = null;  // the task currently on screen
  }

  MultiplicationTrainer.prototype = Object.create(H5P.EventDispatcher.prototype);
  MultiplicationTrainer.prototype.constructor = MultiplicationTrainer;

  /**
   * Fill the placeholders (:name) of a localized string.
   */
  MultiplicationTrainer.prototype.t = function (key, vars) {
    let text = this.params.l10n[key] !== undefined ? this.htmlDecode(this.params.l10n[key]) : key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split(':' + name).join(String(vars[name]));
      });
    }
    return text;
  };

  /**
   * Retrieve decoded HTML encoded string.
   *
   * @param {string} input HTML encoded string.
   * @returns {string} Decoded string.
   */
  MultiplicationTrainer.prototype.htmlDecode = function (input) {
    const dparser = new DOMParser().parseFromString(input, 'text/html');
    return dparser.documentElement.textContent;
  };

  /**
   * Retrieve string without HTML tags.
   *
   * @param {string} input Input string.
   * @returns {string} Output string.
   */
  MultiplicationTrainer.prototype.stripHTML = function (html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  /**
   * Attach the whole activity to the given container (called by H5P core).
   * @param {H5P.jQuery} $container
   */
  MultiplicationTrainer.prototype.attach = function ($container) {
    this.$container = $container;
    this.root = $container.get(0);
    this.root.classList.add('h5p-multiplication-trainer');
    this.renderStart();
  };

  /**
   * Show the start screen with the intro and the Start button.
   */
  MultiplicationTrainer.prototype.renderStart = function () {
    const self = this;
    this.root.innerHTML = '';

    const screen = el('div', 'mt-screen mt-start');

    if (this.params.intro) {
      const intro = el('div', 'mt-intro');
      intro.innerHTML = this.params.intro;
      screen.appendChild(intro);
    }

    const hint = el('p', 'mt-duration-hint');
    hint.textContent = this.t('timeLeftLabel', { time: formatTime(this.params.durationSeconds) });
    screen.appendChild(hint);

    const startBtn = el('button', 'mt-button mt-start-button');
    startBtn.type = 'button';
    startBtn.textContent = this.t('startButton');
    startBtn.addEventListener('click', function () { self.startRound(); });
    screen.appendChild(startBtn);

    this.root.appendChild(screen);
    this.trigger('resize');
  };

  /**
   * Reset the state and start a timed round.
   */
  MultiplicationTrainer.prototype.startRound = function () {
    this.answered = [];
    this.correctCount = 0;
    this.finished = false;
    this.endTime = Date.now() + this.params.durationSeconds * 1000;
    this.renderPlay();
    this.tick();
    // Update the countdown a few times a second for a smooth display.
    const self = this;
    this.timer = setInterval(function () { self.tick(); }, 250);
    this.nextTask();
  };

  /**
   * Build the play screen: status bar (time + score) and the task area.
   */
  MultiplicationTrainer.prototype.renderPlay = function () {
    this.root.innerHTML = '';
    const screen = el('div', 'mt-screen mt-play');

    const status = el('div', 'mt-status');
    this.$time = el('span', 'mt-time');
    this.$score = el('span', 'mt-score');
    status.appendChild(this.$time);
    status.appendChild(this.$score);
    screen.appendChild(status);

    this.$task = el('div', 'mt-task');
    screen.appendChild(this.$task);

    this.root.appendChild(screen);
    this.updateScore();
    this.trigger('resize');
  };

  /**
   * Update the countdown; finish the round when the time is up.
   */
  MultiplicationTrainer.prototype.tick = function () {
    const remaining = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
    if (this.$time) {
      this.$time.textContent = this.t('timeLeftLabel', { time: formatTime(remaining) });
    }
    if (remaining <= 0) {
      this.finish();
    }
  };

  MultiplicationTrainer.prototype.updateScore = function () {
    if (this.$score) {
      this.$score.textContent = this.t('scoreLabel', { count: this.correctCount });
    }
  };

  /**
   * Present a new random task and focus the input field.
   */
  MultiplicationTrainer.prototype.nextTask = function () {
    const self = this;
    const a = randInt(this.minFactor, this.maxFactor);
    const b = randInt(this.minFactor, this.maxFactor);
    const product = a * b;
    const op = this.params.practiceMode === '2' ? 'd' : (this.params.practiceMode === '3' && Math.random() < 0.5 ? 'd' : 'm');
    const taskText = op === 'd'
      ? product + ' ' + this.t('divisionSign') + ' ' + b + ' = '
      : a + ' ' + this.t('multiplicationSign') + ' ' + b + ' = ';

    this.current = { expected: op === 'd' ? a : product, task: taskText };

    this.$task.innerHTML = '';

    const equation = el('span', 'mt-equation');
    equation.textContent = taskText;
    this.$task.appendChild(equation);

    const input = el('input', 'mt-answer');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', taskText + this.t('yourAnswerColumn'));
    this.$task.appendChild(input);

    const submit = el('button', 'mt-button mt-submit-button');
    submit.type = 'button';
    submit.textContent = this.t('submitButton');
    this.$task.appendChild(submit);

    const submitAnswer = function () { self.submit(input.value); };
    submit.addEventListener('click', submitAnswer);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        submitAnswer();
      }
    });

    input.focus();
    this.trigger('resize');
  };

  /**
   * Record an answer and move on to the next task (while time remains).
   */
  MultiplicationTrainer.prototype.submit = function (rawValue) {
    if (!this.current) {
      return;
    }
    const given = (rawValue === undefined || rawValue === null) ? '' : String(rawValue).trim();
    const isCorrect = given !== '' && Number(given) === this.current.expected;

    this.answered.push({
      task: this.current.task,
      expected: this.current.expected,
      given: given,
      correct: isCorrect,
    });
    if (isCorrect) {
      this.correctCount++;
    }
    this.updateScore();

    // Stop if the time ran out while the learner was typing.
    if (Date.now() >= this.endTime) {
      this.finish();
      return;
    }
    this.nextTask();
  };

  /**
   * Stop the timer and show the results table.
   */
  MultiplicationTrainer.prototype.finish = function () {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.current = null;
    this.renderResults();
    this.reportXAPI();
  };

  /**
   * Render the header, summary, results table and Retry button.
   */
  MultiplicationTrainer.prototype.renderResults = function () {
    const self = this;
    this.finished = false; // allow a later finish() after retry
    this.root.innerHTML = '';
    const screen = el('div', 'mt-screen mt-results');

    const header = el('h2', 'mt-results-header');
    header.textContent = this.t('resultsHeader');
    screen.appendChild(header);

    const summary = el('p', 'mt-summary');
    summary.textContent = this.t('summaryText', {
      correct: this.correctCount,
      total: this.answered.length
    });
    screen.appendChild(summary);

    if (this.answered.length === 0) {
      const none = el('p', 'mt-no-tasks');
      none.textContent = this.t('noTasksText');
      screen.appendChild(none);
    }
    else {
      const table = el('table', 'mt-results-table');
      const thead = el('thead');
      const headRow = el('tr');
      [this.t('taskColumn'), this.t('yourAnswerColumn'), this.t('resultColumn')].forEach(function(label) {
        const th = el('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = el('tbody');
      this.answered.forEach(function (item) {
        const tr = el('tr', item.correct ? 'mt-row-correct' : 'mt-row-wrong');

        const taskCell = el('td', 'mt-cell-task');
        taskCell.textContent = item.task;
        tr.appendChild(taskCell);

        const answerCell = el('td', 'mt-cell-answer');
        answerCell.textContent = item.given === '' ? self.t('blankAnswer') : item.given;
        tr.appendChild(answerCell);

        const resultCell = el('td', 'mt-cell-result');
        resultCell.textContent = item.correct
          ? self.t('correctText')
          : self.t('wrongText', { answer: item.expected });
        tr.appendChild(resultCell);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      screen.appendChild(table);
    }

    const retry = el('button', 'mt-button mt-retry-button');
    retry.type = 'button';
    retry.textContent = this.t('retryButton');
    retry.addEventListener('click', function () { self.startRound(); });
    screen.appendChild(retry);

    this.root.appendChild(screen);
    this.trigger('resize');
  };

  /**
   * Report the result to the LMS via xAPI (score = correct answers).
   */
  MultiplicationTrainer.prototype.reportXAPI = function () {
    const max = this.answered.length;
    if (max === 0) {
      return;
    }
    const xAPIEvent = this.createXAPIEventTemplate('completed');
    const def = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    def.description = { 'en-US': 'Multiplication trainer' };
    def.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    def.interactionType = 'fill-in';
    xAPIEvent.setScoredResult(this.correctCount, max, this, true,
      this.correctCount === max);
    this.trigger(xAPIEvent);
  };

  // --- small DOM / math helpers ---

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Format seconds as mm:ss (or ss for short durations under a minute).
   */
  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    if (minutes === 0) {
      return String(seconds);
    }
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  return MultiplicationTrainer;

})(H5P.jQuery);
