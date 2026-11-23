// A comment is a comment.
// <- comment

var freq = 440, ratio = 1.5;
// <- keyword
//  ^ variable
//       ^ operator
//         ^ number
//            ^ punctuation.delimiter
//                      ^ number.float

x = 16rFF + 0x1F - 1e3 * 2pi;
// <- variable
//  ^ number
//        ^ operator
//          ^ number
//                 ^ number.float
//                       ^ number
//                        ^ constant.builtin

y = [$a, \sym, 'a b', "str\n", true, nil, inf];
//  ^ punctuation.bracket
//   ^ character
//       ^ string.special.symbol
//             ^ string.special.symbol
//                    ^ string
//                        ^ string.escape
//                             ^ boolean
//                                   ^ constant.builtin
//                                        ^ constant.builtin

~amp = thisProcess.platform;
// <- variable.member
//     ^ variable.builtin
//                ^ punctuation.delimiter
//                 ^ function.method.call

f = { |freq, amp = 0.1 ... rest| freq * amp <-- rest };
//  ^ punctuation.bracket
//    ^ punctuation.bracket
//     ^ variable.parameter
//           ^ variable.parameter
//                     ^ punctuation.special
//                         ^ variable.parameter
//                             ^ punctuation.bracket
//                               ^ variable
//                                    ^ operator
//                                          ^ operator
//                                              ^ variable

g = { arg in; ^in ** 2 };
//    ^ keyword
//        ^ variable.parameter
//            ^ keyword.return
//                ^ operator

z = SinOsc.ar(freq: 440) ! 2;
//  ^ type
//         ^ function.method.call
//           ^ punctuation.bracket
//            ^ variable.parameter
//                       ^ operator

e = (degree: 0, \dur: 1) -> Set[1];
//   ^ property
//              ^ string.special.symbol
//                       ^ operator
//                          ^ type

if(x.isNil) { 1 } { x.do { |i| i.postln } };
// <- keyword.conditional
//   ^ function.method.call
//                    ^ function.method.call
//                          ^ variable.parameter

while { x < 3 } { x = x + 1 };
// <- keyword.repeat
//        ^ operator

try { x } { |error| error.throw };
// <- keyword.exception
//           ^ variable.parameter
//                  ^ variable

h = x ? y; k = x collect: _.neg; m = x +.t y;
//    ^ operator
//               ^ function.method.call
//                        ^ variable.parameter.builtin
//                                     ^ operator
//                                      ^ operator

n = `x; #p, q = x; r = x | y; s = -x;
//  ^ operator
//      ^ punctuation.special
//       ^ variable
//                       ^ operator
//                                ^ operator

t = { |a = -1, b = nil, c = #[1]| a };
//         ^ operator
//                 ^ constant.builtin
//                          ^ punctuation.special
//                           ^ punctuation.bracket
