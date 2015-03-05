function log_date(msg, date) {
    console.debug(msg + " " + date.format("YYYY-MM-DD HH:mm:ss:SS") + " | " + date);
}

// Selection mode switch. If true, it means 'select' action was called by the user, so we must
// check intersections and calculate the real selection range. Otherwise, the callback was called
// just to refresh days highlighted in the calendar, so selectf may do nothing else.
global_do_compute_selections = true;

function selectf(begin, end) {
	// console.debug("selectf")
    if (global_do_compute_selections) {
        log_date("selectf.begin:", begin);
        log_date("selectf.end:", end);
        var range = {
            begin: moment(begin.format('YYYY-MM-DD')),
            end: moment(end.format('YYYY-MM-DD')) 
        };
        check_and_add_range(range);
    } else {
        // if we are called just to highlight the range, abort further calculations
        //console.debug('compute off');
    }
}

// Check the range selected by the user for intersections with [1] already selected ranges,
// [2] previously booked user's absences; then append the remaining range[s] to absence list.
function check_and_add_range(range) {
    // [1] check with already selected ranges, merging them together
    // If the new range begins within any old one, we are deselecting days from the old ones,
    // otherwise we are merging new range with the old ones.
    // Because old ranges are sorted and disjoint, we can safely detect both things at once.
    var deselecting = false;
	$(".s_range").each(function(index) { 
		var old_range = { begin: moment($(this).attr("s_begin")), end: moment($(this).attr("s_end"))};
        //log_date("--- loop old_range.begin:", old_range.begin);
        //log_date("    loop old_range.end:  ", old_range.end);
        // ranges intersect!
		if (!if_disjoint(range, old_range)) {
            if (in_range(range.begin, old_range) || deselecting) {
                // deselect: remove old range, add back what remains besides the new one
                deselecting = true;
                console.log('activating DESELECT');
                this.remove();
                var old_minus_new = subtract_range(old_range, range);
                for (var i in old_minus_new) {
                    add_checked_range(old_minus_new[i]);
                }
            } else {
                // merge: delete the original range and extend the new one to contain it
                range = join_ranges(range, old_range);
                this.remove();
            }
		}
	});
    //log_date("after disjoints .begin:", range.begin);
    //log_date("after disjoints .end:", range.end);

    if (!deselecting) {
        // [2] subtract already reserved absences and really select what's left
        // (but only if we are adding a selection)
        for (var i in global_logged_users_absences) {
            var cur_range = mapAjaxAbsenceToRange(global_logged_users_absences[i]);
            subtracted = subtract_range(range, cur_range);
            //console.debug("subtracted ", cur_range.begin, " - ", cur_range.end, " -> ", subtracted.length);
            switch(subtracted.length) {
                case 0: // current range covers whole remaining range, nothing more to do
                    range = null;
                    break;
                case 1: // ranges are disjoint or current range cut only one end of the remaining range
                    range = subtracted[0];
                    break;
                case 2:
                    // Current range split the remaining range. We assume that the stored ranges are
                    // sorted and disjoint, thus we know that the first range is ready for displyaing,
                    // but we must still check the latter one.
                    add_checked_range(subtracted[0]);
                    range = subtracted[1];
                    break;
                default:
                    console.error("this should never happen");
            }
            // stop if there is nothing left
            if (range === null) break;
        }
        // if it wasn't erased, the remaining range is also valid
        if (range !== null) add_checked_range(range);
    }

    // when all work is done, refresh the selections, in case we modified the original range
    highlight_selected_ranges();
}

// finalize selectf's job -- add a cleaned and checked range to selected absences
function add_checked_range(range) {
    var begin_str = range.begin.format('YYYY-MM-DD');
    var end_str = range.end.format('YYYY-MM-DD');

    var display_date = {begin: moment(range.begin), end: moment(range.end)};
    display_date.end.subtract(1, "days");

    log_date("display_date.begin:", display_date.begin);
    log_date("display_date.end:", display_date.end)

    var days_between = range.end.diff(range.begin, 'days');

    var display_range_str;

    if (days_between == 1) {
        display_range_str = display_date.begin.format('DD MMM');
    } else {
        if (display_date.begin.month() == display_date.end.month()) {
            display_range_str = display_date.begin.format('DD') + ' - ' + display_date.end.format('DD MMM');
        } else {
            display_range_str = display_date.begin.format('DD MMM') + ' - ' + display_date.end.format('DD MMM');
        }
    }

    $('#absence_select').append(''
        + '<a href="#" class="s_range list-group-item rm-absence-selection" '
        + 's_begin=\'' + begin_str + '\' s_end=\'' + end_str + '\'>'
    	+ display_range_str
        + ' <span class="badge">' + days_between
       + ' <span class="glyphicon glyphicon-remove"></span>'
        + '</span>'
        + '<input type="hidden" name="begin[]" value="' + begin_str + '" />'
        + '<input type="hidden" name="end[]" value="' + end_str + '" />'
     	+ '</a>');

    function comp(a,b) {
     	return ($(b).attr("s_begin") < $(a).attr("s_begin")) ?  1 : -1
     }
    $('#absence_select a').sort(comp).appendTo('#absence_select');
}

function unselectf(view, jsEvent) {
	//console.debug("unselectf");
	$('#yourCalendar').fullCalendar('unselect');
}

// (b1 <= b2) =>
// 1. [b1  [b2   e2]  e1] -> [b1  e1]
// 2. [b1  [b2   e1]  e2] -> [b1  e2]

// if_disjoint :: { begin: moment, end: moment} , {begin: moment, end: moment} -> bool 
function if_disjoint(range1, range2) {
	if (range1.begin > range2.begin)
		return if_disjoint(range2, range1); // now we know that range1.begin <= range2.begin
	return range1.end < range2.begin;
}

// join_ranges :: { begin: moment, end: moment} , {begin: moment, end: moment} -> {moment, moment} 
function join_ranges(range1, range2) {
	if (range1.begin > range2.begin)
		return join_ranges(range2, range1); // now we know that range1.begin <= range2.begin
	if (range1.end <= range2.end) 
		return {begin: range1.begin, end: range2.end }; // 2.
	else
		return {begin: range1.begin, end: range1.end }; // 1.
}

// Substract range2 from range1. Returns an array of zero, one or two ranges.
function subtract_range(range1, range2) {
    if (if_disjoint(range1, range2)) return [range1];
    if (range2.begin <= range1.begin) {
        // range2 completely covers range1
        if (range2.end >= range1.end) return new Array();
        // range2 covers only beginning of range1
        return [{begin: range2.end, end: range1.end}];
    } else {
        // range2 covers only ending of range1
        if (range2.end >= range1.end) return [{begin: range1.begin, end: range2.begin}];
        // range2 splits range1 into two ranges
        return [{begin: range1.begin, end: range2.begin}, {begin: range2.end, end: range1.end}];
    }
}

// Returns whether a moment is within given range.
function in_range(point, range) {
    return point >= range.begin && point < range.end;
}

function mapAjaxAbsenceToRange(absence) {
    return { begin: moment(absence.begin), 
             end: moment(absence.end) };
}

$(document).on('click', '.rm-absence-selection', function(){
	console.debug('removing selected range');
	// if someone has more stupid idea to refresh all selected days, please show me
	$(this).remove();
    highlight_selected_ranges();
});

// When passed as 'selectOverlap' calendar's parameter, this function disallows selections
// intersecting with user's current absences.
function check_select_overlap(cal_event) {
    console.debug("check_select_overlap for event #" + cal_event.id + ": " + cal_event.title + ", "
            + cal_event.user_id);
    return cal_event.user_id !== global_logged_user_id;
}

// Highlight ("select") all currently planned absence ranges on the calendar.
// To be used on view switching or after manual unselect (to "unhighlight" some days).
function highlight_selected_ranges() {
    // switch off computing selections, to avoid recursive re-calculations inside `select` callback
    global_do_compute_selections = false;
    // first, delete all current selections (I see no way to do this partially or less brutally)
    $('div.fc-highlight-skeleton').remove();
	// then, reselect remaining selections
	$(".s_range").each(function(index) {
		m1 = moment($(this).attr("s_begin"));
		m2 = moment($(this).attr("s_end"));
		$('#calendar').fullCalendar('select', m1, m2);
	});
    $('td.fc-highlight').addClass('confirmed-highlight')
    // restore normal selection mode
    global_do_compute_selections = true;
}

// To be connected to FC's viewRender callback, triggered after every view switch.
function view_render_callback(view, element) {
    highlight_selected_ranges();
}
