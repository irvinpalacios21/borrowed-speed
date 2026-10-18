# Draft racing

A racing game inspired by Five Miles to Go. These terms describe the race and drafting relationships; the design brief records proposed rules and scope.

## Language

**Race**:
One contest with a defined starting order, finish distance, and finishing order.
_Avoid_: Round, match, level

**Field**:
All cars participating in a race, including the player's car.

**Pack**:
A group of nearby cars that may occupy different racing lines.

**Racing line**:
A car's lateral path along the track. Two cars can share a racing line while occupying different positions along it.
_Avoid_: Lane, unless the design explicitly introduces discrete lanes

**Drafting**:
The speed benefit cars receive by racing close together and aligned with one another.

**Draft link**:
The relationship between a closely aligned leading car and following car that allows them to draft together.

**Drafting train**:
A connected group of cars joined by draft links on a racing line.
_Avoid_: Pack when specifically referring to linked cars

**Front draft**:
The drafting benefit associated with a car ahead of the car receiving the benefit.

**Rear draft**:
The connection to a following car that can push when it closes onto the train. An exposed leader has no slipstream of its own.

**Pass**:
A change in the relative order of two cars when one moves ahead of the other.

**Merge**:
A car's movement onto another racing line, potentially joining a drafting train.

**Progress**:
The distance a car has traveled along the course since the race started.

**Position**:
A car's rank in the field, determined by race progress and ultimately its finish crossing.
_Avoid_: Position when referring to a car's lateral location

**Race record**:
The result of one completed race, including the player's finishing position.

**Driver stats**:
Totals and averages accumulated across completed race records.

**Draft speed gain**:
A car's current speed above its solo base speed, gained through a tow, a push, or carried approach momentum.

**Slipstream closing advantage**:
The extra speed an approaching car builds in a wake before settling onto the car ahead.

**Latched following**:
Following closely enough to settle at the leading car's pace and contribute to its push. The approach momentum has been spent, so pulling out does not create a slingshot.

**Push**:
Propulsion transferred from close followers to the cars ahead of them. A leader gains speed through its followers' push rather than receiving its own slipstream bonus.

**Slingshot**:
A pass attempted by pulling out of a wake with closing speed before latching onto the car ahead. The car carries the speed earned during its approach while that momentum fades.

**Close follower**:
A car close behind in the same physical path, whose space would be compressed by braking. A wake connection alone does not make a distant or laterally clear car a close follower.

**Braking**:
A deliberate reduction in speed to drop back or position for another wake. It is available to the player and opponents only when there is no close follower behind them.

**Team**:
A named entrant represented by two drivers whose points combine in the team championship.

**Driver**:
A named competitor with a unique car number and an individual championship record. Each driver belongs to one team throughout a season.

**Player driver**:
The single driver selected before a season starts and controlled by the player throughout that season.

**Teammate**:
The other driver belonging to the same team. Teammates can cooperate through drafting while retaining their own race results.

**Season**:
A sequence of ten scheduled races contested by sixteen drivers representing eight teams.

**Scheduled race**:
One named race with an assigned distance and a fixed place in the season.

**Championship standings**:
The ranking of drivers or teams by accumulated points, with finishing records breaking ties.
_Avoid_: Race order, which describes the order within a single race

**Reverse grid**:
A starting order that reverses the individual driver championship ranking, placing lower-ranked drivers ahead.

**Starting grid**:
The ordered arrangement of cars before a race, in two staggered columns.

**Season result**:
The complete finishing order and crossing times of all sixteen drivers in one scheduled race.

**Race setting**:
The visual location and lighting associated with an event, such as coastal, desert, forest, or night.
