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
    minFactor: 1,
    maxFactor: 10,
    l10n: {
      startButton: 'Start',
      submitButton: 'Enter',
      retryButton: 'Try again',
      timeLeftLabel: 'Time left: :time',
      scoreLabel: 'Correct: :count',
      multiplicationSign: '×',
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
    var text = this.params.l10n[key] !== undefined ? this.params.l10n[key] : key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split(':' + name).join(String(vars[name]));
      });
    }
    return text;
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
    var self = this;
    this.root.innerHTML = '';

    var screen = el('div', 'mt-screen mt-start');

    if (this.params.intro) {
      var intro = el('div', 'mt-intro');
      intro.innerHTML = this.params.intro;
      screen.appendChild(intro);
    }

    var hint = el('p', 'mt-duration-hint');
    hint.textContent = this.t('timeLeftLabel', { time: formatTime(this.params.durationSeconds) });
    screen.appendChild(hint);

    var startBtn = el('button', 'mt-button mt-start-button');
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
    var self = this;
    this.timer = setInterval(function () { self.tick(); }, 250);
    this.nextTask();
  };

  /**
   * Build the play screen: status bar (time + score) and the task area.
   */
  MultiplicationTrainer.prototype.renderPlay = function () {
    this.root.innerHTML = '';
    var screen = el('div', 'mt-screen mt-play');

    var status = el('div', 'mt-status');
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
    var remaining = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
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
    var self = this;
    var a = randInt(this.minFactor, this.maxFactor);
    var b = randInt(this.minFactor, this.maxFactor);
    this.current = { a: a, b: b, product: a * b };

    this.$task.innerHTML = '';

    var equation = el('span', 'mt-equation');
    equation.textContent = a + ' ' + this.t('multiplicationSign') + ' ' + b + ' = ';
    this.$task.appendChild(equation);

    var input = el('input', 'mt-answer');
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', a + ' ' + this.t('multiplicationSign') + ' ' + b);
    this.$task.appendChild(input);

    var submit = el('button', 'mt-button mt-submit-button');
    submit.type = 'button';
    submit.textContent = this.t('submitButton');
    this.$task.appendChild(submit);

    var submitAnswer = function () { self.submit(input.value); };
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
    var given = (rawValue === undefined || rawValue === null) ? '' : String(rawValue).trim();
    var isCorrect = given !== '' && Number(given) === this.current.product;

    this.answered.push({
      a: this.current.a,
      b: this.current.b,
      product: this.current.product,
      given: given,
      correct: isCorrect
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
    var self = this;
    this.finished = false; // allow a later finish() after retry
    this.root.innerHTML = '';
    var screen = el('div', 'mt-screen mt-results');

    var header = el('h2', 'mt-results-header');
    header.textContent = this.t('resultsHeader');
    screen.appendChild(header);

    var summary = el('p', 'mt-summary');
    summary.textContent = this.t('summaryText', {
      correct: this.correctCount,
      total: this.answered.length
    });
    screen.appendChild(summary);

    if (this.answered.length === 0) {
      var none = el('p', 'mt-no-tasks');
      none.textContent = this.t('noTasksText');
      screen.appendChild(none);
    }
    else {
      var table = el('table', 'mt-results-table');
      var thead = el('thead');
      var headRow = el('tr');
      [this.t('taskColumn'), this.t('yourAnswerColumn'), this.t('resultColumn')].forEach(function (label) {
        var th = el('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      var tbody = el('tbody');
      this.answered.forEach(function (item) {
        var tr = el('tr', item.correct ? 'mt-row-correct' : 'mt-row-wrong');

        var taskCell = el('td', 'mt-cell-task');
        taskCell.textContent = item.a + ' ' + self.t('multiplicationSign') + ' ' + item.b + ' = ' + item.product;
        tr.appendChild(taskCell);

        var answerCell = el('td', 'mt-cell-answer');
        answerCell.textContent = item.given === '' ? self.t('blankAnswer') : item.given;
        tr.appendChild(answerCell);

        var resultCell = el('td', 'mt-cell-result');
        resultCell.textContent = item.correct
          ? self.t('correctText')
          : self.t('wrongText', { answer: item.product });
        tr.appendChild(resultCell);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      screen.appendChild(table);
    }

    var retry = el('button', 'mt-button mt-retry-button');
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
    var max = this.answered.length;
    if (max === 0) {
      return;
    }
    var xAPIEvent = this.createXAPIEventTemplate('completed');
    var def = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
    def.description = { 'en-US': 'Multiplication trainer' };
    def.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    def.interactionType = 'fill-in';
    xAPIEvent.setScoredResult(this.correctCount, max, this, true,
      this.correctCount === max);
    this.trigger(xAPIEvent);
  };

  // --- small DOM / math helpers ---

  function el(tag, className) {
    var node = document.createElement(tag);
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
    var s = Math.max(0, Math.round(totalSeconds));
    var minutes = Math.floor(s / 60);
    var seconds = s % 60;
    if (minutes === 0) {
      return String(seconds);
    }
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  return MultiplicationTrainer;

})(H5P.jQuery);
