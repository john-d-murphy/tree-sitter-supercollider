Voice : Object {
// <- type
//      ^ type

    classvar <>count = 0;
//  ^ keyword
//           ^ keyword.modifier
//             ^ variable.member

    var <name, prState;
//  ^ keyword
//      ^ keyword.modifier
//       ^ variable.member
//             ^ variable.member

    const max = 8;
//  ^ keyword
//        ^ constant

    *new { |name| ^super.new.init(name) }
//  ^ keyword.modifier
//   ^ function.method
//          ^ variable.parameter
//                 ^ variable.builtin
//                       ^ function.method.call
//                                ^ variable

    init { |n| name = n; this.changed(\init); _BasicNew }
//  ^ function.method
//                       ^ variable.builtin
//                            ^ function.method.call
//                                            ^ function.builtin

}

+ Object { isVoice { ^false } }
// <- keyword.modifier
//         ^ function.method
//                    ^ boolean
